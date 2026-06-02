import { Controller, Post, Get, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentPatient, CurrentTenant, Public } from '../../../../common/decorators';
import { PatientSessionGuard } from '../../../public/infrastructure/guards/patient-session.guard';
import { PaymentsService } from '../../application/services/payments.service';

/**
 * Endpoints de pago para el paciente (flujo público de booking).
 *
 * Auth: Bearer <sessionToken> del paciente (PatientSessionGuard).
 * El slug en el path resuelve el tenant (TenantMiddleware estrategia 0).
 *
 *   POST /public/tenants/:slug/appointments/:id/payment → genera QR
 *   GET  /public/tenants/:slug/payments/:intentId        → estado (polling)
 */
@Public() // bypass JwtAuthGuard global (no es staff/admin)
@Controller('public/tenants/:slug')
export class PaymentsPublicController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('appointments/:id/payment')
  @UseGuards(PatientSessionGuard)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  async createPayment(
    @CurrentTenant() tenantId: string,
    @CurrentPatient('phone') phone: string,
    @Param('id') appointmentId: string,
  ) {
    if (!tenantId) throw new NotFoundException('Tenant no encontrado');
    const result = await this.payments.createIntent({
      tenantId,
      appointmentId,
      expectedPhone: phone,
    });
    return { success: true, data: result };
  }

  @Get('payments/:intentId')
  @UseGuards(PatientSessionGuard)
  @Throttle({ default: { limit: 120, ttl: 60 * 1000 } }) // polling cada ~1s permitido
  async getStatus(
    @CurrentTenant() tenantId: string,
    @CurrentPatient('phone') phone: string,
    @Param('intentId') intentId: string,
  ) {
    if (!tenantId) throw new NotFoundException('Tenant no encontrado');
    const result = await this.payments.getIntentStatus({
      tenantId,
      intentId,
      expectedPhone: phone,
    });
    return { success: true, data: result };
  }
}
