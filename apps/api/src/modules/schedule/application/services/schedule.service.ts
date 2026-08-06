import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { ReplaceScheduleRulesDto, CreateScheduleBlockDto } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';

/** Quién pide la operación, derivado del JWT (nunca del body/query). */
export interface Requester {
  userId: string;
  role: string;
}

/**
 * Agenda de disponibilidad por especialista: reglas semanales y bloqueos.
 *
 * **Lectura** (`listRules` / `listBlocks`) es abierta dentro de la clínica: la
 * recepción y el resto del equipo necesitan ver cuándo atiende cada quien para
 * agendar, y el motor de slots la consume.
 *
 * **Escritura** está scopeada por doctor: un DOCTOR solo edita SU agenda. Sin
 * esto, cualquier especialista podía borrar el horario semanal de un colega
 * (`PUT /schedule/doctors/:doctorId/rules` reemplaza el set completo) o quitarle
 * sus bloqueos de vacaciones, y la clínica lo vería como slots libres.
 */
@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  /** Un DOCTOR solo escribe sobre su propia agenda; ADMIN sobre la de todos. */
  private assertOwnAgenda(requester: Requester | undefined, doctorId: string) {
    if (requester?.role === 'DOCTOR' && doctorId !== requester.userId) {
      throw new ForbiddenException('Solo puedes modificar tu propia agenda');
    }
  }

  // ───── Reglas semanales ─────

  async listRules(tenantId: string, doctorId: string) {
    await this.assertDoctorBelongs(tenantId, doctorId);
    return this.prisma.client.doctorScheduleRule.findMany({
      where: { doctorId, tenantId, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
    });
  }

  /**
   * Reemplaza atómicamente todas las reglas del doctor.
   * Patrón típico: el frontend manda el set completo del horario semanal.
   */
  async replaceRules(
    tenantId: string,
    doctorId: string,
    dto: ReplaceScheduleRulesDto,
    requester?: Requester,
  ) {
    this.assertOwnAgenda(requester, doctorId);
    await this.assertDoctorBelongs(tenantId, doctorId);

    // Validar que las reglas no se solapen dentro del mismo día
    this.assertNoIntraDayOverlap(dto.rules);

    // Transacción explícita: delete+create deben ser atómicos. Ya no se confía
    // en una transacción global del interceptor (en modo RLS dormante no existe).
    await this.prisma.$transaction(async (tx) => {
      await tx.doctorScheduleRule.deleteMany({ where: { doctorId, tenantId } });
      if (dto.rules.length > 0) {
        await tx.doctorScheduleRule.createMany({
          data: dto.rules.map((r) => ({ ...r, doctorId, tenantId })),
        });
      }
    });

    return this.prisma.client.doctorScheduleRule.findMany({
      where: { doctorId, tenantId },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
    });
  }

  // ───── Bloqueos puntuales ─────

  async createBlock(
    tenantId: string,
    doctorId: string,
    dto: CreateScheduleBlockDto,
    requester?: Requester,
  ) {
    this.assertOwnAgenda(requester, doctorId);
    await this.assertDoctorBelongs(tenantId, doctorId);
    return this.prisma.client.doctorScheduleBlock.create({
      data: {
        doctorId,
        tenantId,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        reason: dto.reason,
      },
    });
  }

  async listBlocks(tenantId: string, doctorId: string, range?: { from?: Date; to?: Date }) {
    await this.assertDoctorBelongs(tenantId, doctorId);
    return this.prisma.client.doctorScheduleBlock.findMany({
      where: {
        doctorId,
        tenantId,
        ...(range?.from && { endTime: { gte: range.from } }),
        ...(range?.to && { startTime: { lte: range.to } }),
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async deleteBlock(tenantId: string, blockId: string, requester?: Requester) {
    const block = await this.prisma.client.doctorScheduleBlock.findFirst({
      where: { id: blockId, tenantId },
      select: { id: true, doctorId: true },
    });
    if (!block) throw new NotFoundException('Bloqueo no encontrado');
    // El bloqueo se identifica solo por su id (no lleva doctorId en la ruta):
    // el dueño se resuelve leyéndolo primero y se valida contra el solicitante.
    this.assertOwnAgenda(requester, block.doctorId);
    await this.prisma.client.doctorScheduleBlock.delete({ where: { id: blockId } });
    return { success: true };
  }

  // ───── Helpers ─────

  private async assertDoctorBelongs(tenantId: string, doctorId: string) {
    const doctor = await this.prisma.client.user.findFirst({
      where: { id: doctorId, tenantId, role: 'DOCTOR' },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Doctor no encontrado');
  }

  private assertNoIntraDayOverlap(
    rules: { dayOfWeek: number; startMinute: number; endMinute: number }[],
  ) {
    const byDay = new Map<number, { startMinute: number; endMinute: number }[]>();
    for (const r of rules) {
      const list = byDay.get(r.dayOfWeek) ?? [];
      list.push(r);
      byDay.set(r.dayOfWeek, list);
    }
    for (const [day, ranges] of byDay) {
      ranges.sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 1; i < ranges.length; i++) {
        if (ranges[i].startMinute < ranges[i - 1].endMinute) {
          throw new BadRequestException(
            `Reglas solapadas en día ${day}: ${ranges[i - 1].startMinute}-${ranges[i - 1].endMinute} y ${ranges[i].startMinute}-${ranges[i].endMinute}`,
          );
        }
      }
    }
  }
}
