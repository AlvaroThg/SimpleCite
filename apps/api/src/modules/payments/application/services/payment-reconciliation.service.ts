import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/database/prisma.service';

/**
 * Job de conciliación de pagos y limpieza de estados vencidos.
 *
 * Corre cada minuto (cross-tenant, sin contexto RLS — usa this.prisma).
 * Tres responsabilidades:
 *   1. Expirar PaymentIntents PENDING cuyo expiresAt ya pasó.
 *   2. Cancelar citas PENDING_PAYMENT sin intent activo (PENDING/PAID) →
 *      libera el slot (el exclusion constraint dejará de bloquearlo).
 *   3. Cancelar citas TENTATIVE vencidas (limpieza del flujo de reserva).
 *
 * Idempotente por construcción: solo afecta filas cuyo estado/tiempo lo amerita.
 */
@Injectable()
export class PaymentReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcile() {
    const now = new Date();

    // 1. Expirar intents PENDING vencidos
    const expiredIntents = await this.prisma.paymentIntent.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });

    // 2. Cancelar citas PENDING_PAYMENT sin intent activo.
    //    "Sin intent activo" = no tienen ningún intent PENDING ni PAID.
    const stuck = await this.prisma.appointment.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        paymentIntents: { none: { status: { in: ['PENDING', 'PAID'] } } },
      },
      select: { id: true, tenantId: true },
    });

    if (stuck.length > 0) {
      await this.prisma.appointment.updateMany({
        where: { id: { in: stuck.map((a) => a.id) } },
        data: { status: 'CANCELLED', qrPayload: null },
      });
    }

    // 3. Cancelar citas TENTATIVE vencidas (flujo de reserva pública)
    const expiredTentative = await this.prisma.appointment.updateMany({
      where: { status: 'TENTATIVE', expiresAt: { lt: now } },
      data: { status: 'CANCELLED', expiresAt: null },
    });

    if (expiredIntents.count > 0 || stuck.length > 0 || expiredTentative.count > 0) {
      this.logger.log(
        {
          event: 'payment.reconcile.done',
          expiredIntents: expiredIntents.count,
          cancelledUnpaid: stuck.length,
          cancelledTentative: expiredTentative.count,
        },
        'PaymentReconciliationService',
      );
    }
  }
}
