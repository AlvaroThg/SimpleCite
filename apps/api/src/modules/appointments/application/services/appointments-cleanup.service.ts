import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/database/prisma.service';

/**
 * Limpieza de citas TENTATIVE vencidas (flujo de reserva pública).
 *
 * Una TENTATIVE bloquea el slot vía exclusion constraint mientras el paciente
 * completa el wizard; si abandona, este job la cancela al vencer su TTL y el
 * horario vuelve a quedar libre. Corre cada minuto, cross-tenant, idempotente.
 *
 * (Heredado del PaymentReconciliationService al eliminar la pasarela legacy:
 * las citas de pago manual NUNCA se auto-cancelan — solo las TENTATIVE.)
 */
@Injectable()
export class AppointmentsCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredTentative() {
    const expired = await this.prisma.appointment.updateMany({
      where: { status: 'TENTATIVE', expiresAt: { lt: new Date() } },
      data: { status: 'CANCELLED', expiresAt: null },
    });

    if (expired.count > 0) {
      this.logger.log(
        { event: 'appointments.cleanup.tentative-expired', cancelled: expired.count },
        'AppointmentsCleanupService',
      );
    }
  }
}
