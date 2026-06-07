import { Controller, Post, Get, Body } from '@nestjs/common';
import { LinkSubscriptionSchema, type LinkSubscriptionDto } from '@simplecite/shared';
import { CurrentUser, Roles } from '../../../../common/decorators';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { BillingService } from '../../application/services/billing.service';

/**
 * Endpoints de facturación del panel (autenticados).
 * El JwtAuthGuard global ya valida el Bearer token; el tenantId sale del JWT.
 */
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /**
   * Vincula la suscripción de PayPal aprobada en el frontend al tenant actual.
   * SEGURIDAD: se ignora cualquier tenantId del body; se usa el del JWT.
   */
  @Post('link-subscription')
  @Roles('ADMIN')
  async link(
    @CurrentUser('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(LinkSubscriptionSchema)) dto: LinkSubscriptionDto,
  ) {
    const data = await this.billing.linkSubscription(tenantId, dto.subscriptionId);
    return { success: true, data };
  }

  /** Estado de la suscripción del tenant (para mostrarlo en el panel). */
  @Get('status')
  @Roles('ADMIN', 'DOCTOR', 'STAFF')
  async status(@CurrentUser('tenantId') tenantId: string) {
    const data = await this.billing.getStatus(tenantId);
    return { success: true, data };
  }
}
