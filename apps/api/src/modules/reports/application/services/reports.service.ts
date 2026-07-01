import { Injectable } from '@nestjs/common';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { PrismaService } from '../../../../common/database/prisma.service';

export interface ReportDoctorRow {
  doctorId: string;
  doctorName: string;
  income: number;
  completed: number;
  cancelled: number;
  noShow: number;
  total: number;
}
export interface ReportAnalytics {
  from: string;
  to: string;
  totals: { income: number; completed: number; cancelled: number; noShow: number; total: number };
  byDoctor: ReportDoctorRow[];
  incomeOverTime: { date: string; income: number }[];
}

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

    const [citasHoy, ingresoAppts, noShow, completed, proximas] = await Promise.all([
      // Citas de hoy (no canceladas)
      this.prisma.client.appointment.count({
        where: {
          tenantId,
          startTime: { gte: todayStart, lte: todayEnd },
          status: { notIn: ['CANCELLED', 'TENTATIVE'] },
        },
      }),
      // Ingresos del mes (modelo híbrido): citas del mes ya cobradas — pagadas por
      // QR (isPaid) o completadas (efectivo cobrado en clínica). Se valora por el
      // precio del servicio. (PaymentIntent quedó legacy y ya no se usa.)
      this.prisma.client.appointment.findMany({
        where: {
          tenantId,
          startTime: { gte: monthStart, lte: monthEnd },
          OR: [{ isPaid: true }, { status: 'COMPLETED' }],
        },
        select: { service: { select: { price: true } } },
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
    const ingresosMes = ingresoAppts.reduce((sum, a) => sum + Number(a.service.price), 0);

    return {
      citasHoy,
      ingresosMes,
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

  /**
   * Analítica por rango de fechas (solo ADMIN): ingresos y conteos por doctor,
   * e ingresos en el tiempo (por día en la zona del tenant). Ingreso = precio del
   * servicio de citas cobradas (isPaid) o completadas. Aproximación: no refleja
   * overrides de precio por doctor (customPrice).
   */
  async analytics(tenantId: string, fromIso?: string, toIso?: string): Promise<ReportAnalytics> {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const tz = tenant?.timezone ?? 'America/La_Paz';
    const now = new Date();
    const from = fromIso ? new Date(fromIso) : subDays(now, 30);
    const to = toIso ? new Date(toIso) : now;

    const appts = await this.prisma.client.appointment.findMany({
      where: { tenantId, startTime: { gte: from, lte: to } },
      select: {
        startTime: true,
        status: true,
        isPaid: true,
        doctorId: true,
        doctor: { select: { name: true } },
        service: { select: { price: true } },
      },
    });

    const byDoctor = new Map<string, ReportDoctorRow>();
    const byDay = new Map<string, number>();
    const totals = { income: 0, completed: 0, cancelled: 0, noShow: 0, total: appts.length };

    for (const a of appts) {
      const price = Number(a.service.price);
      const isRevenue = a.isPaid || a.status === 'COMPLETED';
      const row: ReportDoctorRow = byDoctor.get(a.doctorId) ?? {
        doctorId: a.doctorId,
        doctorName: a.doctor.name,
        income: 0,
        completed: 0,
        cancelled: 0,
        noShow: 0,
        total: 0,
      };
      row.total++;
      if (a.status === 'COMPLETED') {
        row.completed++;
        totals.completed++;
      } else if (a.status === 'CANCELLED') {
        row.cancelled++;
        totals.cancelled++;
      } else if (a.status === 'NO_SHOW') {
        row.noShow++;
        totals.noShow++;
      }
      if (isRevenue) {
        row.income += price;
        totals.income += price;
        const day = formatInTimeZone(a.startTime, tz, 'yyyy-MM-dd');
        byDay.set(day, (byDay.get(day) ?? 0) + price);
      }
      byDoctor.set(a.doctorId, row);
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totals,
      byDoctor: [...byDoctor.values()].sort((a, b) => b.income - a.income),
      incomeOverTime: [...byDay.entries()]
        .map(([date, income]) => ({ date, income }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
}
