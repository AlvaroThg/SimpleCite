import { Injectable } from '@nestjs/common';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { PrismaService } from '../../../../common/database/prisma.service';

/**
 * Métricas operativas del tenant para la pantalla de Inicio del panel.
 * Todo tenant-scoped (`where:{tenantId}`). Sin contenido clínico.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string) {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const tz = tenant?.timezone ?? 'America/La_Paz';
    const now = new Date();

    // "Hoy" en la timezone de la clínica → rango UTC.
    const localNow = toZonedTime(now, tz);
    const todayStart = fromZonedTime(startOfDay(localNow), tz);
    const todayEnd = fromZonedTime(endOfDay(localNow), tz);
    const monthStart = fromZonedTime(startOfMonth(localNow), tz);
    const monthEnd = fromZonedTime(endOfMonth(localNow), tz);
    const last30 = subDays(now, 30);

    const [citasHoy, ingresos, noShow, completed, proximas] = await Promise.all([
      // Citas de hoy (no canceladas)
      this.prisma.client.appointment.count({
        where: {
          tenantId,
          startTime: { gte: todayStart, lte: todayEnd },
          status: { notIn: ['CANCELLED', 'TENTATIVE'] },
        },
      }),
      // Ingresos del mes: suma de intents PAID con paidAt en el mes
      this.prisma.client.paymentIntent.aggregate({
        where: { tenantId, status: 'PAID', paidAt: { gte: monthStart, lte: monthEnd } },
        _sum: { amount: true },
      }),
      // Inasistencias (últimos 30 días)
      this.prisma.client.appointment.count({
        where: { tenantId, status: 'NO_SHOW', startTime: { gte: last30 } },
      }),
      this.prisma.client.appointment.count({
        where: { tenantId, status: 'COMPLETED', startTime: { gte: last30 } },
      }),
      // Próximas 5 citas confirmadas
      this.prisma.client.appointment.findMany({
        where: { tenantId, status: 'CONFIRMED', startTime: { gte: now } },
        select: {
          id: true,
          startTime: true,
          patient: { select: { name: true } },
          doctor: { select: { name: true } },
          service: { select: { name: true } },
        },
        orderBy: { startTime: 'asc' },
        take: 5,
      }),
    ]);

    const totalCerradas = noShow + completed;
    const tasaInasistencia = totalCerradas > 0 ? Math.round((noShow / totalCerradas) * 100) : 0;

    return {
      citasHoy,
      ingresosMes: Number(ingresos._sum.amount ?? 0),
      tasaInasistencia, // porcentaje 0-100 (últimos 30 días)
      proximasCitas: proximas.map((a) => ({
        id: a.id,
        startTime: a.startTime,
        patientName: a.patient.name,
        doctorName: a.doctor.name,
        serviceName: a.service.name,
      })),
    };
  }
}
