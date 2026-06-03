import { Injectable, NotFoundException } from '@nestjs/common';
import type { PatientListQueryDto, PatientHistoryQueryDto } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';
import { normalizePhone, normalizeCi } from '../../../../common/utils/phone';
import { clampLimit, cursorArgs, buildPage } from '../../../../common/utils/pagination';

export interface RequesterContext {
  tenantId: string;
  userId: string;
  role: 'ADMIN' | 'DOCTOR' | 'STAFF';
}

/**
 * Gestión de pacientes y su historial clínico.
 *
 * Aislamiento de tenant: TODA query filtra explícitamente por tenantId
 * (el RLS de Supabase está dormante — ver memoria del proyecto). El acceso
 * a notas clínicas se controla por rol en esta capa.
 */
@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Listado paginado de pacientes con búsqueda libre (nombre/phone/ci).
   * Accesible por cualquier rol autenticado (datos demográficos, no clínicos).
   */
  async list(tenantId: string, query: PatientListQueryDto) {
    const limit = clampLimit(query.limit);
    const q = query.q?.trim();

    const where = {
      tenantId,
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: normalizePhone(q) } },
          { ci: { contains: normalizeCi(q) } },
        ],
      }),
    };

    const rows = await this.prisma.client.patient.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        ci: true,
        createdAt: true,
        _count: { select: { appointments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...cursorArgs(query.cursor),
    });

    return buildPage(rows, limit);
  }

  /**
   * Historial de un paciente: citas (todos los roles) + notas clínicas
   * (filtradas por rol). Verifica pertenencia al tenant (protección cross-tenant).
   */
  async getHistory(ctx: RequesterContext, patientId: string, query: PatientHistoryQueryDto) {
    const patient = await this.prisma.client.patient.findFirst({
      where: { id: patientId, tenantId: ctx.tenantId },
      select: { id: true, name: true, phone: true, ci: true, createdAt: true },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const limit = clampLimit(query.limit);
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const dateRange =
      from || to ? { startTime: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {};

    // ── Citas: visibles para cualquier rol autenticado (dato de agenda) ──
    const apptRows = await this.prisma.client.appointment.findMany({
      where: { tenantId: ctx.tenantId, patientId, ...dateRange },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        isPaid: true,
        doctor: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { startTime: 'desc' },
      take: limit + 1,
      ...cursorArgs(query.cursor),
    });
    const appointments = buildPage(apptRows, limit);

    // ── Notas clínicas: control de acceso por rol ──
    const clinicalAccess = await this.canReadClinicalNotes(ctx, patientId);
    let notes: unknown[] = [];
    if (clinicalAccess.canRead) {
      notes = await this.prisma.client.medicalNote.findMany({
        where: {
          tenantId: ctx.tenantId,
          patientId,
          // Doctor sin relación con el paciente: solo ve sus propias notas.
          ...(clinicalAccess.onlyOwn && { doctorId: ctx.userId }),
          ...(from || to
            ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }
            : {}),
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          appointmentId: true,
          doctor: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100, // notas por paciente acotadas; sin cursor en MVP
      });
    }

    return {
      patient,
      appointments,
      notes,
      clinicalAccess: clinicalAccess.canRead,
    };
  }

  /**
   * Determina si el solicitante puede leer notas clínicas del paciente.
   *   - ADMIN: sí (todas)
   *   - DOCTOR con cita con el paciente: sí (todas)
   *   - DOCTOR sin cita: solo las que él escribió (onlyOwn)
   *   - STAFF: no
   */
  private async canReadClinicalNotes(
    ctx: RequesterContext,
    patientId: string,
  ): Promise<{ canRead: boolean; onlyOwn: boolean }> {
    if (ctx.role === 'ADMIN') return { canRead: true, onlyOwn: false };
    if (ctx.role === 'STAFF') return { canRead: false, onlyOwn: false };

    // DOCTOR: ¿tiene (o tuvo) una cita con este paciente?
    const appt = await this.prisma.client.appointment.findFirst({
      where: { tenantId: ctx.tenantId, patientId, doctorId: ctx.userId },
      select: { id: true },
    });
    return { canRead: true, onlyOwn: !appt };
  }

  /**
   * Dedupe de identidad de paciente: normaliza phone (E.164) y ci, busca por
   * (tenantId, phone) y por (tenantId, ci); si existe, devuelve ese paciente
   * (completando datos faltantes); si no, lo crea.
   *
   * Usado por el flujo de booking público y el bot conversacional.
   */
  async findOrCreate(params: {
    tenantId: string;
    phone: string;
    name: string;
    ci?: string;
  }): Promise<{ id: string }> {
    const { tenantId, name } = params;
    const phone = normalizePhone(params.phone);
    const ci = params.ci ? normalizeCi(params.ci) : undefined;

    // 1. Buscar por phone (clave principal)
    let patient = await this.prisma.client.patient.findFirst({
      where: { tenantId, phone },
      select: { id: true, ci: true },
    });

    // 2. Si no hay por phone pero sí hay ci, buscar por ci
    if (!patient && ci) {
      patient = await this.prisma.client.patient.findFirst({
        where: { tenantId, ci },
        select: { id: true, ci: true },
      });
    }

    if (patient) {
      // Completar ci si faltaba y ahora lo tenemos
      if (ci && !patient.ci) {
        await this.prisma.client.patient.update({
          where: { id: patient.id },
          data: { ci },
        });
      }
      return { id: patient.id };
    }

    const created = await this.prisma.client.patient.create({
      data: { tenantId, phone, name, ci: ci ?? null },
      select: { id: true },
    });
    return created;
  }
}
