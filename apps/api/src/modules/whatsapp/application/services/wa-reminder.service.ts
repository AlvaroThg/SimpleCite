import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Logger } from 'nestjs-pino';
import { toZonedTime } from 'date-fns-tz';
import { PrismaService } from '../../../../common/database/prisma.service';
import { WaMessageService } from './wa-message.service';
import { InstanceManagerService } from './instance-manager.service';

/**
 * Envía recordatorios de cita por WhatsApp el día anterior.
 * Corre a las 12:00 UTC (08:00 Bolivia UTC-4).
 * Usa messageKey idempotente para no duplicar si el cron se re-ejecuta.
 */
@Injectable()
export class WaReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waMessage: WaMessageService,
    private readonly manager: InstanceManagerService,
    private readonly logger: Logger,
  ) {}

  @Cron('0 12 * * *')
  async sendDailyReminders() {
    const now = new Date();
    const tomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    const dayAfter = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2),
    );

    const appointments = await this.prisma.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        startTime: { gte: tomorrow, lt: dayAfter },
      },
      include: {
        patient: { select: { phone: true, name: true } },
        doctor: { select: { name: true } },
        service: { select: { name: true } },
        tenant: { select: { id: true, slug: true, timezone: true } },
      },
    });

    this.logger.log({ event: 'wa.reminder.run', count: appointments.length }, 'WaReminderService');

    for (const appt of appointments) {
      try {
        const instance = await this.manager.getInstanceByTenantId(appt.tenantId);
        if (!instance || instance.status !== 'CONNECTED') continue;
        // Paciente registrado solo con CI: no hay número al que recordarle.
        if (!appt.patient.phone) continue;

        const tz = appt.tenant.timezone ?? 'America/La_Paz';
        const local = toZonedTime(appt.startTime, tz);
        const time = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;

        await this.waMessage.send({
          tenantId: appt.tenantId,
          tenantSlug: appt.tenant.slug,
          messageKey: `reminder:${appt.id}`,
          phone: appt.patient.phone,
          text:
            `🏥 *Recordatorio de cita — mañana*\n\n` +
            `Hola *${appt.patient.name}*, te recordamos tu cita de mañana:\n\n` +
            `📋 *${appt.service.name}*\n` +
            `👨‍⚕️ ${appt.doctor.name}\n` +
            `🕐 ${time}\n\n` +
            `Si no puedes asistir, comunícate con la clínica.\n\n— SimpleCite`,
        });

        this.logger.log(
          { event: 'wa.reminder.sent', appointmentId: appt.id, tenantId: appt.tenantId },
          'WaReminderService',
        );
      } catch (err) {
        this.logger.warn(
          { event: 'wa.reminder.failed', appointmentId: appt.id, err: (err as Error).message },
          'WaReminderService',
        );
      }
    }
  }
}
