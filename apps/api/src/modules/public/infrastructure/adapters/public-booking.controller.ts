import { Controller, Post, Body, Param, Req, UseGuards, NotFoundException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  CreatePublicAppointmentSchema,
  ConfirmPublicBookingSchema,
  type CreatePublicAppointmentDto,
  type ConfirmPublicBookingDto,
} from '@simplecite/shared';
import { CurrentPatient, CurrentTenant, Public } from '../../../../common/decorators';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { OptionalPatientSessionGuard } from '../guards/optional-patient-session.guard';
import { SubscriptionGuard } from '../../../billing/infrastructure/guards/subscription.guard';
import { PublicBookingService } from '../../application/services/public-booking.service';

/**
 * Endpoints de booking público.
 *
 * Auth (según `PUBLIC_BOOKING_REQUIRE_OTP`, ver OptionalPatientSessionGuard):
 *   - Modo OTP (bot activo): Bearer <sessionToken> del flujo de WhatsApp.
 *   - Modo abierto (default `main`, sin bot): el phone viaja en el body;
 *     Turnstile + rate limit por teléfono protegen el alta (en el service).
 *
 * Rate limit por IP (throttler): create más estricto que confirm para frenar
 * el squatting de slots con reservas falsas.
 */
// Si la clínica no tiene suscripción vigente, su booking público queda cerrado (402).
// El SubscriptionGuard resuelve el tenant desde el slug (req.tenantId del middleware).
@Public() // bypass JwtAuthGuard global (no es staff/admin)
@UseGuards(SubscriptionGuard)
@Controller('public/tenants/:slug/appointments')
export class PublicBookingController {
  constructor(private readonly service: PublicBookingService) {}

  @Post()
  @UseGuards(OptionalPatientSessionGuard)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  async createTentative(
    @CurrentTenant() tenantId: string,
    @CurrentPatient('phone') phone: string,
    @Body(new ZodValidationPipe(CreatePublicAppointmentSchema))
    dto: CreatePublicAppointmentDto,
    @Req() req: Request,
  ) {
    if (!tenantId) throw new NotFoundException('Tenant no encontrado');
    const result = await this.service.createTentative({
      tenantId,
      phone,
      dto,
      remoteIp: this.extractIp(req),
    });
    return { success: true, data: result };
  }

  @Post(':id/confirm')
  @UseGuards(OptionalPatientSessionGuard)
  @Throttle({ default: { limit: 15, ttl: 60 * 60 * 1000 } })
  async confirm(
    @CurrentTenant() tenantId: string,
    @CurrentPatient('phone') phone: string,
    @Param('id') appointmentId: string,
    @Body(new ZodValidationPipe(ConfirmPublicBookingSchema)) dto: ConfirmPublicBookingDto,
  ) {
    if (!tenantId) throw new NotFoundException('Tenant no encontrado');
    const result = await this.service.confirm({
      tenantId,
      phone,
      appointmentId,
      paymentMethod: dto.paymentMethod,
      tenantInsuranceId: dto.tenantInsuranceId,
    });
    return { success: true, data: result };
  }

  private extractIp(req: Request): string | undefined {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
    return req.ip;
  }
}
