import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { addDays, startOfDay, endOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { SlotsQueryDto, SlotDto } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';

const MAX_RANGE_DAYS = 60;

/**
 * Motor de generación de slots de disponibilidad.
 *
 * Algoritmo:
 *   1. Resolver DoctorService → duración del slot (custom o catálogo)
 *   2. Resolver tenant.timezone
 *   3. Para cada día en [from, to]:
 *      a. Aplicar reglas semanales del doctor (en timezone local)
 *      b. Restar bloqueos del doctor
 *      c. Restar citas existentes (PENDING_PAYMENT + CONFIRMED)
 *      d. Cortar en bloques de `duration` minutos
 *      e. Filtrar slots en el pasado
 */
@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(tenantId: string, query: SlotsQueryDto): Promise<SlotDto[]> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    if (to <= from) {
      throw new BadRequestException('"to" debe ser posterior a "from"');
    }
    const days = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException(`El rango máximo es de ${MAX_RANGE_DAYS} días`);
    }

    // 1. Tenant + DoctorService (duración) + reglas + bloqueos + citas existentes
    const [tenant, doctorService] = await Promise.all([
      this.prisma.client.tenant.findFirst({
        where: { id: tenantId },
        select: { timezone: true },
      }),
      this.prisma.client.doctorService.findFirst({
        where: {
          doctorId: query.doctorId,
          serviceId: query.serviceId,
          tenantId, // aislamiento: un doctorId de otra clínica no resuelve
          isActive: true,
        },
        include: { service: { select: { duration: true } } },
      }),
    ]);
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    if (!doctorService) {
      throw new NotFoundException('El doctor no ofrece este servicio');
    }

    const timezone = tenant.timezone;
    const duration = doctorService.customDuration ?? doctorService.service.duration;

    const [rules, blocks, existingAppointments] = await Promise.all([
      this.prisma.client.doctorScheduleRule.findMany({
        where: { doctorId: query.doctorId, tenantId, isActive: true },
      }),
      this.prisma.client.doctorScheduleBlock.findMany({
        where: {
          doctorId: query.doctorId,
          tenantId,
          endTime: { gte: from },
          startTime: { lte: to },
        },
      }),
      this.prisma.client.appointment.findMany({
        where: {
          doctorId: query.doctorId,
          tenantId,
          // TENTATIVE también ocupa: hay un paciente verificando OTP en este slot.
          // Coherente con el exclusion constraint que también incluye TENTATIVE.
          status: { in: ['TENTATIVE', 'PENDING_PAYMENT', 'CONFIRMED'] },
          endTime: { gte: from },
          startTime: { lte: to },
        },
        select: { startTime: true, endTime: true },
      }),
    ]);

    // Agrupar reglas por dayOfWeek para lookup O(1)
    const rulesByDay = new Map<number, { startMinute: number; endMinute: number }[]>();
    for (const r of rules) {
      const list = rulesByDay.get(r.dayOfWeek) ?? [];
      list.push({ startMinute: r.startMinute, endMinute: r.endMinute });
      rulesByDay.set(r.dayOfWeek, list);
    }

    // 2. Generar slots día por día
    const slots: SlotDto[] = [];
    const now = new Date();

    for (let dayIdx = 0; dayIdx < days; dayIdx++) {
      const dayUtc = addDays(from, dayIdx);
      const dayLocal = toZonedTime(dayUtc, timezone);
      const dayOfWeek = dayLocal.getDay(); // 0..6 en timezone local
      const dayRules = rulesByDay.get(dayOfWeek);
      if (!dayRules?.length) continue;

      for (const rule of dayRules) {
        // Construir startTime/endTime en UTC a partir del minuto local del día
        const ruleStartLocal = this.buildLocalDateTime(dayLocal, rule.startMinute);
        const ruleEndLocal = this.buildLocalDateTime(dayLocal, rule.endMinute);
        const ruleStartUtc = fromZonedTime(ruleStartLocal, timezone);
        const ruleEndUtc = fromZonedTime(ruleEndLocal, timezone);

        // 3. Cortar en slots de `duration` minutos
        let cursor = ruleStartUtc;
        while (cursor.getTime() + duration * 60_000 <= ruleEndUtc.getTime()) {
          const slotEnd = new Date(cursor.getTime() + duration * 60_000);

          // Filtros de disponibilidad
          const inPast = cursor < now;
          const blocked = this.overlapsBlock(cursor, slotEnd, blocks);
          const taken = this.overlapsBlock(cursor, slotEnd, existingAppointments);

          if (!inPast) {
            slots.push({
              startTime: cursor.toISOString(),
              endTime: slotEnd.toISOString(),
              available: !blocked && !taken,
            });
          }

          cursor = slotEnd;
        }
      }
    }

    // Recortar al rango [from, to] (la fecha 'to' puede partir un día)
    return slots.filter((s) => {
      const slotStart = new Date(s.startTime);
      return slotStart >= startOfDay(from) && slotStart < endOfDay(to);
    });
  }

  private buildLocalDateTime(day: Date, minutesFromMidnight: number): Date {
    const hours = Math.floor(minutesFromMidnight / 60);
    const minutes = minutesFromMidnight % 60;
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
  }

  private overlapsBlock(
    slotStart: Date,
    slotEnd: Date,
    intervals: { startTime: Date; endTime: Date }[],
  ): boolean {
    return intervals.some((iv) => slotStart < iv.endTime && slotEnd > iv.startTime);
  }
}
