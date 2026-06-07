import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { ReplaceScheduleRulesDto, CreateScheduleBlockDto } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  // â”€â”€â”€â”€â”€ Reglas semanales â”€â”€â”€â”€â”€

  async listRules(tenantId: string, doctorId: string) {
    await this.assertDoctorBelongs(tenantId, doctorId);
    return this.prisma.client.doctorScheduleRule.findMany({
      where: { doctorId, tenantId, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
    });
  }

  /**
   * Reemplaza atÃ³micamente todas las reglas del doctor.
   * PatrÃ³n tÃ­pico: el frontend manda el set completo del horario semanal.
   */
  async replaceRules(tenantId: string, doctorId: string, dto: ReplaceScheduleRulesDto) {
    await this.assertDoctorBelongs(tenantId, doctorId);

    // Validar que las reglas no se solapen dentro del mismo dÃ­a
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

  // â”€â”€â”€â”€â”€ Bloqueos puntuales â”€â”€â”€â”€â”€

  async createBlock(tenantId: string, doctorId: string, dto: CreateScheduleBlockDto) {
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

  async deleteBlock(tenantId: string, blockId: string) {
    const block = await this.prisma.client.doctorScheduleBlock.findFirst({
      where: { id: blockId, tenantId },
    });
    if (!block) throw new NotFoundException('Bloqueo no encontrado');
    await this.prisma.client.doctorScheduleBlock.delete({ where: { id: blockId } });
    return { success: true };
  }

  // â”€â”€â”€â”€â”€ Helpers â”€â”€â”€â”€â”€

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
            `Reglas solapadas en dÃ­a ${day}: ${ranges[i - 1].startMinute}-${ranges[i - 1].endMinute} y ${ranges[i].startMinute}-${ranges[i].endMinute}`,
          );
        }
      }
    }
  }
}
