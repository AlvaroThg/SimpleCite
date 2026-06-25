import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Estado de suscripción del tenant autenticado (para el panel).
   * La activación/renovación se gestiona manualmente en DB por ahora
   * (no hay pasarela de pago para el SaaS).
   */
  async getStatus(tenantId: string) {
    return this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        subscriptionStatus: true,
        subscriptionEndDate: true,
        plan: true,
      },
    });
  }
}
