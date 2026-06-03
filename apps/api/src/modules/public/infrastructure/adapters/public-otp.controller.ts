import { Controller, Post, Body, Req, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  type OtpRequestDto,
  type OtpVerifyDto,
} from '@simplecite/shared';
import { CurrentTenant, Public } from '../../../../common/decorators';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { PublicOtpService } from '../../application/services/public-otp.service';

/**
 * Endpoints de OTP por WhatsApp (login invisible del paciente).
 *
 * Rate limiting: backed por DB en PublicOtpService (ver enforceRateLimits):
 *   - request: 3/hora por (tenant, phone) + 30/hora por IP
 *   - verify:  protegido por el lock de 5 intentos por OTP en DB
 * Este enfoque sustituye al OtpThrottlerGuard, cuyo tracker IP+phone era
 * eclipsado por el ThrottlerGuard global (que limitaba por-IP de forma
 * colectiva). El ThrottlerGuard global (100/min por IP) sigue como tope externo.
 */
@Public()
@Controller('public/tenants/:slug/otp')
export class PublicOtpController {
  constructor(private readonly service: PublicOtpService) {}

  @Post('request')
  async request(
    @CurrentTenant() tenantId: string,
    @Body(new ZodValidationPipe(OtpRequestSchema)) dto: OtpRequestDto,
    @Req() req: Request,
  ) {
    if (!tenantId) throw new NotFoundException('Tenant no encontrado');
    const result = await this.service.request({
      tenantId,
      phone: dto.phone,
      turnstileToken: dto.turnstileToken,
      remoteIp: this.extractIp(req),
    });
    return { success: true, data: result };
  }

  @Post('verify')
  async verify(
    @CurrentTenant() tenantId: string,
    @Body(new ZodValidationPipe(OtpVerifySchema)) dto: OtpVerifyDto,
  ) {
    if (!tenantId) throw new NotFoundException('Tenant no encontrado');
    const result = await this.service.verify({
      tenantId,
      phone: dto.phone,
      code: dto.code,
    });
    return { success: true, data: result };
  }

  private extractIp(req: Request): string | undefined {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
    return req.ip;
  }
}
