import { Controller, Get } from '@nestjs/common';
import { CurrentUser, Roles } from '../../../../common/decorators';
import { BillingService } from '../../application/services/billing.service';

/**
 * Endpoints de facturación del panel (autenticados).
 * El JwtAuthGuard global ya valida el Bearer token; el tenantId sale del JWT.
 */
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Estado de la suscripción del tenant (para mostrarlo en el panel). */
  @Get('status')
  @Roles('ADMIN', 'DOCTOR', 'STAFF')
  async status(@CurrentUser('tenantId') tenantId: string) {
    const data = await this.billing.getStatus(tenantId);
    return { success: true, data };
  }
}
