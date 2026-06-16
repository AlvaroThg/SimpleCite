import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { CreatePrescriptionDto } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';
import type { RequesterContext } from './medical-records.service';

/**
 * Recetas digitales. Mismo modelo de acceso que la historia clínica:
 *   - ADMIN / DOCTOR escriben; STAFF no.
 *   - El DOCTOR solo opera sobre historias de sus propias citas.
 */
@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  private assertClinicalRole(ctx: RequesterContext) {
    if (ctx.role === 'STAFF') {
      throw new ForbiddenException('El personal de recepción no emite recetas');
    }
  }

  /** Carga la historia clínica validando tenant + scope de doctor. */
  private async assertRecordAccess(ctx: RequesterContext, medicalRecordId: string) {
    const record = await this.prisma.client.medicalRecord.findFirst({
      where: { id: medicalRecordId, tenantId: ctx.tenantId },
      select: { id: true, patientId: true, doctorId: true },
    });
    if (!record) throw new NotFoundException('Historia clínica no encontrada');
    if (ctx.role === 'DOCTOR' && record.doctorId !== ctx.userId) {
      throw new ForbiddenException('No tienes acceso a esta historia clínica');
    }
    return record;
  }

  async create(ctx: RequesterContext, medicalRecordId: string, dto: CreatePrescriptionDto) {
    this.assertClinicalRole(ctx);
    const record = await this.assertRecordAccess(ctx, medicalRecordId);

    const prescription = await this.prisma.client.prescription.create({
      data: {
        medicalRecordId,
        patientId: record.patientId,
        doctorId: ctx.userId,
        tenantId: ctx.tenantId,
        medications: dto.medications,
        instructions: dto.instructions ?? null,
      },
    });

    this.logger.log(
      {
        event: 'ehr.prescription.created',
        tenantId: ctx.tenantId,
        medicalRecordId,
        prescriptionId: prescription.id,
        authorId: ctx.userId,
        items: dto.medications.length,
      },
      'PrescriptionsService',
    );

    return prescription;
  }

  async listByRecord(ctx: RequesterContext, medicalRecordId: string) {
    this.assertClinicalRole(ctx);
    await this.assertRecordAccess(ctx, medicalRecordId);
    return this.prisma.client.prescription.findMany({
      where: { medicalRecordId, tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(ctx: RequesterContext, id: string) {
    this.assertClinicalRole(ctx);
    const prescription = await this.prisma.client.prescription.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!prescription) throw new NotFoundException('Receta no encontrada');
    if (ctx.role === 'DOCTOR' && prescription.doctorId !== ctx.userId) {
      throw new ForbiddenException('No tienes acceso a esta receta');
    }
    return prescription;
  }

  async remove(ctx: RequesterContext, id: string) {
    const prescription = await this.findById(ctx, id); // valida acceso
    await this.prisma.client.prescription.delete({ where: { id: prescription.id } });
    return { id: prescription.id, deleted: true };
  }
}
