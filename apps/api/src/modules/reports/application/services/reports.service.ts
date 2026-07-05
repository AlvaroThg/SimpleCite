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
export interface ReportInsuranceRow {
  /// Nombre desde insuranceNameSnapshot (inmutable), NUNCA el id actual.
  name: string;
  /// Citas del período cubiertas por este seguro (no canceladas).
  count: number;
  /// Valor referencial para la clínica: suma del precio de lista congelado.
  /// El paciente pagó Bs 0 — esto NO es ingreso.
  referentialValue: number;
}
export interface ReportAnalytics {
  from: string;
  to: string;
  totals: { income: number; completed: number; cancelled: number; noShow: number; total: number };
  /// Desglose del ingreso real por método de cobro (INSURANCE nunca suma aquí).
  incomeByMethod: { cash: number; qr: number };
  /// Columnas dinámicas por seguro presente en el período (desde snapshots).
  byInsurance: ReportInsuranceRow[];
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
          // Citas por seguro: el paciente paga Bs 0 — nunca son ingreso.
          paymentMethod: { not: 'INSURANCE' },
        },
        select: { price: true, service: { select: { price: true } } },
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
    const ingresosMes = ingresoAppts.reduce(
      (sum, a) => sum + Number(a.price ?? a.service.price),
      0,
    );

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
        price: true,
        paymentMethod: true,
        insuranceNameSnapshot: true,
        doctor: { select: { name: true } },
        service: { select: { price: true } },
      },
    });

    const byDoctor = new Map<string, ReportDoctorRow>();
    const byDay = new Map<string, number>();
    const byInsurance = new Map<string, ReportInsuranceRow>();
    const incomeByMethod = { cash: 0, qr: 0 };
    const totals = { income: 0, completed: 0, cancelled: 0, noShow: 0, total: appts.length };

    for (const a of appts) {
      // Monto congelado en la cita; legacy (null) → precio actual del servicio.
      const price = Number(a.price ?? a.service.price);
      const isInsurance = a.paymentMethod === 'INSURANCE';
      // Ingreso real = cobrado al paciente. Las citas de seguro pagan Bs 0:
      // se reportan aparte con su valor referencial, nunca como ingreso.
      const isRevenue = !isInsurance && (a.isPaid || a.status === 'COMPLETED');
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
        if (a.paymentMethod === 'STATIC_QR') incomeByMethod.qr += price;
        else incomeByMethod.cash += price;
        const day = formatInTimeZone(a.startTime, tz, 'yyyy-MM-dd');
        byDay.set(day, (byDay.get(day) ?? 0) + price);
      }
      // Columnas dinámicas por seguro (nombre desde el snapshot inmutable).
      if (isInsurance && a.status !== 'CANCELLED') {
        const name = a.insuranceNameSnapshot ?? 'Seguro';
        const ins = byInsurance.get(name) ?? { name, count: 0, referentialValue: 0 };
        ins.count++;
        ins.referentialValue += price;
        byInsurance.set(name, ins);
      }
      byDoctor.set(a.doctorId, row);
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totals,
      incomeByMethod,
      byInsurance: [...byInsurance.values()].sort((a, b) => b.count - a.count),
      byDoctor: [...byDoctor.values()].sort((a, b) => b.income - a.income),
      incomeOverTime: [...byDay.entries()]
        .map(([date, income]) => ({ date, income }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * Historial completo de citas del tenant como CSV (Excel-friendly).
   * Sin from/to exporta TODO; con rango, esa franja. Sin contenido clínico.
   */
  async appointmentsCsv(
    tenantId: string,
    fromIso?: string,
    toIso?: string,
  ): Promise<{ csv: string; filename: string }> {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true, timezone: true },
    });
    const tz = tenant?.timezone ?? 'America/La_Paz';

    const appts = await this.prisma.client.appointment.findMany({
      where: {
        tenantId,
        ...((fromIso || toIso) && {
          startTime: {
            ...(fromIso && { gte: new Date(fromIso) }),
            ...(toIso && { lte: new Date(toIso) }),
          },
        }),
      },
      select: {
        startTime: true,
        endTime: true,
        status: true,
        paymentMethod: true,
        isPaid: true,
        price: true,
        insuranceNameSnapshot: true,
        createdAt: true,
        patient: { select: { name: true, phone: true, ci: true } },
        doctor: { select: { name: true } },
        service: { select: { name: true, price: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    const METHOD: Record<string, string> = {
      CASH: 'Efectivo',
      STATIC_QR: 'QR Bancario',
      INSURANCE: 'Seguro',
    };
    const STATUS: Record<string, string> = {
      TENTATIVE: 'Tentativa',
      PENDING_PAYMENT: 'Pendiente de pago',
      CONFIRMED: 'Confirmada',
      COMPLETED: 'Completada',
      CANCELLED: 'Cancelada',
      NO_SHOW: 'No asistió',
    };
    // Comillas dobles escapadas y celda entre comillas (CSV RFC 4180).
    const cell = (v: string | number | null | undefined) =>
      `"${String(v ?? '').replace(/"/g, '""')}"`;

    const header = [
      'Fecha',
      'Hora',
      'Paciente',
      'CI',
      'Teléfono',
      'Doctor',
      'Servicio',
      'Estado',
      'Método de pago',
      'Seguro',
      'Monto (Bs)',
      'Pagada',
      'Creada',
    ].join(',');

    const rows = appts.map((a) =>
      [
        cell(formatInTimeZone(a.startTime, tz, 'yyyy-MM-dd')),
        cell(formatInTimeZone(a.startTime, tz, 'HH:mm')),
        cell(a.patient.name),
        cell(a.patient.ci),
        cell(a.patient.phone),
        cell(a.doctor.name),
        cell(a.service.name),
        cell(STATUS[a.status] ?? a.status),
        cell(METHOD[a.paymentMethod] ?? a.paymentMethod),
        cell(a.insuranceNameSnapshot),
        // Seguro = Bs 0 al paciente; el resto usa el monto congelado.
        cell(
          a.paymentMethod === 'INSURANCE' ? '0.00' : Number(a.price ?? a.service.price).toFixed(2),
        ),
        cell(a.isPaid ? 'Sí' : 'No'),
        cell(formatInTimeZone(a.createdAt, tz, 'yyyy-MM-dd HH:mm')),
      ].join(','),
    );

    return {
      csv: [header, ...rows].join('\r\n'),
      filename: `citas-${tenant?.slug ?? 'clinica'}-${formatInTimeZone(new Date(), tz, 'yyyyMMdd')}.csv`,
    };
  }
}
