import { Controller, Post, Body, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CreatePublicAppointmentSchema,
  ConfirmPublicBookingSchema,
  type CreatePublicAppointmentDto,
  type ConfirmPublicBookingDto,
} from '@simplecite/shared';
import { CurrentPatient, CurrentTenant, Public } from '../../../../common/decorators';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { PatientSessionGuard } from '../guards/patient-session.guard';
import { SubscriptionGuard } from '../../../billing/infrastructure/guards/subscription.guard';
import { PublicBookingService } from '../../application/services/public-booking.service';

/**
 * Endpoints de booking público — requieren OTP previo.
 *
 * Auth: Bearer <sessionToken> (devuelto por POST /otp/verify).
 *   - PatientSessionGuard valida el JWT del paciente.
 *   - El phone del JWT debe coincidir con el de la sesión.
 *
 * Rate limit: por sessionToken implícitamente (un token = un phone), más
 * 30 reservas por hora por IP para evitar bots con muchos tokens.
 */
// Si la clínica no tiene suscripción vigente, su booking público queda cerrado (402).
// El SubscriptionGuard resuelve el tenant desde el slug (req.tenantId del middleware).
@Public() // bypass JwtAuthGuard global (no es staff/admin)
@UseGuards(SubscriptionGuard)
@Controller('public/tenants/:slug/appointments')
export class PublicBookingController {
  constructor(private readonly service: PublicBookingService) {}

  @Post()
  @UseGuards(PatientSessionGuard)
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
  async createTentative(
    @CurrentTenant() tenantId: string,
    @CurrentPatient('phone') phone: string,
    @Body(new ZodValidationPipe(CreatePublicAppointmentSchema))
    dto: CreatePublicAppointmentDto,
  ) {
    if (!tenantId) throw new NotFoundException('Tenant no encontrado');
    const result = await this.service.createTentative({ tenantId, phone, dto });
    return { success: true, data: result };
  }

  @Post(':id/confirm')
  @UseGuards(PatientSessionGuard)
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
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
    });
    return { success: true, data: result };
  }
}
