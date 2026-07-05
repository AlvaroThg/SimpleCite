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

    // Medicamentos vinculados al inventario: descontar 1 unidad por item y
    // avisar (no bloquear) si el stock queda en o bajo el umbral de reposición.
    const lowStock = await this.decrementLinkedStock(ctx.tenantId, dto.medications);

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

    return { ...prescription, lowStock };
  }

  /**
   * Descuenta stock de los productos referenciados por la receta (1 unidad por
   * item con productId; el stock nunca baja de 0). El descuento es un UPDATE
   * atómico (GREATEST en SQL): dos recetas simultáneas nunca pierden unidades
   * por carrera lectura-escritura. Best-effort: un fallo de inventario no rompe
   * la emisión de la receta. Devuelve los productos que quedaron en o bajo su
   * lowStockThreshold para el toast de advertencia.
   */
  private async decrementLinkedStock(
    tenantId: string,
    medications: { productId?: string }[],
  ): Promise<{ id: string; name: string; stock: number }[]> {
    const counts = new Map<string, number>();
    for (const m of medications) {
      if (m.productId) counts.set(m.productId, (counts.get(m.productId) ?? 0) + 1);
    }
    if (counts.size === 0) return [];

    const lowStock: { id: string; name: string; stock: number }[] = [];
    try {
      for (const [productId, qty] of counts) {
        // UPDATE atómico: decremento y clamp a 0 en un solo statement.
        const rows = await this.prisma.client.$queryRaw<
          { id: string; name: string; stock: number; lowStockThreshold: number | null }[]
        >`UPDATE "products"
          SET "stock" = GREATEST(0, "stock" - ${qty}), "updatedAt" = NOW()
          WHERE "id" = ${productId} AND "tenantId" = ${tenantId}
          RETURNING "id", "name", "stock", "lowStockThreshold"`;
        const p = rows[0]; // texto libre con id inválido: 0 filas, se ignora
        if (p && p.lowStockThreshold !== null && p.stock <= p.lowStockThreshold) {
          lowStock.push({ id: p.id, name: p.name, stock: p.stock });
        }
      }
    } catch (err) {
      this.logger.warn(
        { event: 'ehr.prescription.stock-decrement-failed', err: (err as Error).message },
        'PrescriptionsService',
      );
    }
    return lowStock;
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
