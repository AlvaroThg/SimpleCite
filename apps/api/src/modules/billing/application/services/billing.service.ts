import { Injectable, BadRequestException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PaypalClient } from './paypal.client';

const PERIOD_DAYS = 30;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paypal: PaypalClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Vincula una suscripción de PayPal al tenant AUTENTICADO. El tenantId viene
   * del JWT (nunca del body) por seguridad. Best-effort: si PayPal ya reporta la
   * suscripción ACTIVE, la activamos sin esperar el webhook (útil en dev local,
   * donde el webhook de Sandbox no puede llegar a localhost).
   */
  async linkSubscription(tenantId: string, subscriptionId: string) {
    if (!subscriptionId) throw new BadRequestException('subscriptionId requerido');

    await this.prisma.client.tenant.update({
      where: { id: tenantId },
      data: { paypalSubscriptionId: subscriptionId },
    });

    const sub = await this.paypal.getSubscription(subscriptionId).catch(() => null);
    if (sub && (sub.status === 'ACTIVE' || sub.status === 'APPROVED')) {
      await this.activateBySubscriptionId(subscriptionId, sub.billing_info?.next_billing_time);
    }

    this.logger.log(
      { event: 'billing.subscription.linked', tenantId, subscriptionId },
      'BillingService',
    );
    return this.getStatus(tenantId);
  }

  /** Estado de suscripción del tenant autenticado (para el panel). */
  async getStatus(tenantId: string) {
    return this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        paypalSubscriptionId: true,
        subscriptionStatus: true,
        subscriptionEndDate: true,
        plan: true,
      },
    });
  }

  /**
   * Activa/renueva la suscripción por su id de PayPal. Idempotente.
   * Usado por el webhook (sin contexto tenant → `this.prisma` directo) y por el
   * sync de `linkSubscription`. Pone status=ACTIVE y endDate = next_billing_time
   * (o NOW + 30 días si no viene).
   */
  async activateBySubscriptionId(subscriptionId: string, nextBillingTime?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { paypalSubscriptionId: subscriptionId },
      select: { id: true },
    });
    if (!tenant) {
      this.logger.warn({ event: 'billing.activate.no-tenant', subscriptionId }, 'BillingService');
      return { updated: false };
    }
    const end = nextBillingTime
      ? new Date(nextBillingTime)
      : new Date(Date.now() + PERIOD_DAYS * 86_400_000);
    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { subscriptionStatus: 'ACTIVE', subscriptionEndDate: end },
    });
    this.logger.log(
      { event: 'billing.subscription.activated', tenantId: tenant.id, subscriptionId, end },
      'BillingService',
    );
    return { updated: true };
  }

  /** Marca la suscripción como PAST_DUE o CANCELED (desde webhooks). */
  async setStatusBySubscriptionId(subscriptionId: string, status: 'PAST_DUE' | 'CANCELED') {
    const tenant = await this.prisma.tenant.findUnique({
      where: { paypalSubscriptionId: subscriptionId },
      select: { id: true },
    });
    if (!tenant) return { updated: false };
    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { subscriptionStatus: status },
    });
    this.logger.log(
      { event: 'billing.subscription.status', tenantId: tenant.id, subscriptionId, status },
      'BillingService',
    );
    return { updated: true };
  }
}
