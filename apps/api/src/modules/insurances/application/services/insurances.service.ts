import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import type {
  CreateTenantInsuranceDto,
  UpdateTenantInsuranceDto,
  SetDoctorInsuranceDto,
} from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';

/**
 * Seguros médicos (Addendum G).
 *
 * Catálogo por tenant (TenantInsurance) + asignación por doctor (DoctorInsurance).
 * Archivar es soft (isActive:false): los seguros archivados dejan de aparecer en
 * el booking, pero las citas históricas conservan su insuranceNameSnapshot.
 */
@Injectable()
export class InsurancesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Catálogo completo del tenant (activos primero, luego archivados). */
  async list(tenantId: string) {
    return this.prisma.client.tenantInsurance.findMany({
      where: { tenantId },
      select: { id: true, name: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateTenantInsuranceDto) {
    const existing = await this.prisma.client.tenantInsurance.findFirst({
      where: { tenantId, name: dto.name },
      select: { id: true, isActive: true },
    });
    if (existing) {
      // Re-activar uno archivado con el mismo nombre en vez de fallar.
      if (!existing.isActive) {
        return this.prisma.client.tenantInsurance.update({
          where: { id: existing.id },
          data: { isActive: true },
          select: { id: true, name: true, isActive: true },
        });
      }
      throw new ConflictException('Ya existe un seguro con ese nombre');
    }
    return this.prisma.client.tenantInsurance.create({
      data: { tenantId, name: dto.name },
      select: { id: true, name: true, isActive: true },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateTenantInsuranceDto) {
    const insurance = await this.prisma.client.tenantInsurance.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!insurance) throw new NotFoundException('Seguro no encontrado');

    try {
      return await this.prisma.client.tenantInsurance.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        select: { id: true, name: true, isActive: true },
      });
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException('Ya existe un seguro con ese nombre');
      }
      throw e;
    }
  }

  /**
   * Seguros del catálogo activo con su estado de asignación a un doctor.
   * Alimenta los checkboxes de /panel/doctors.
   */
  async listForDoctor(tenantId: string, doctorId: string) {
    const doctor = await this.prisma.client.user.findFirst({
      where: { id: doctorId, tenantId, role: 'DOCTOR' },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Doctor no encontrado');

    const [catalog, assignments] = await Promise.all([
      this.prisma.client.tenantInsurance.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.client.doctorInsurance.findMany({
        where: { tenantId, doctorId, isActive: true },
        select: { tenantInsuranceId: true },
      }),
    ]);
    const assigned = new Set(assignments.map((a) => a.tenantInsuranceId));
    return catalog.map((c) => ({ ...c, assigned: assigned.has(c.id) }));
  }

  /** Marca/desmarca un seguro para un doctor (upsert de DoctorInsurance). */
  async setForDoctor(tenantId: string, doctorId: string, dto: SetDoctorInsuranceDto) {
    const [doctor, insurance] = await Promise.all([
      this.prisma.client.user.findFirst({
        where: { id: doctorId, tenantId, role: 'DOCTOR' },
        select: { id: true },
      }),
      this.prisma.client.tenantInsurance.findFirst({
        where: { id: dto.tenantInsuranceId, tenantId },
        select: { id: true },
      }),
    ]);
    if (!doctor) throw new NotFoundException('Doctor no encontrado');
    if (!insurance) throw new NotFoundException('Seguro no encontrado');

    await this.prisma.client.doctorInsurance.upsert({
      where: {
        doctorId_tenantInsuranceId: { doctorId, tenantInsuranceId: dto.tenantInsuranceId },
      },
      create: {
        tenantId,
        doctorId,
        tenantInsuranceId: dto.tenantInsuranceId,
        isActive: dto.isActive,
      },
      update: { isActive: dto.isActive },
    });
    return this.listForDoctor(tenantId, doctorId);
  }
}
