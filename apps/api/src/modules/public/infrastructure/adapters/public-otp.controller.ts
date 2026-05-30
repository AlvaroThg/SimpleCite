import { Controller, Post, Body, Req, NotFoundException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  type OtpRequestDto,
  type OtpVerifyDto,
} from '@simplecite/shared';
import { CurrentTenant, Public } from '../../../../common/decorators';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { OtpThrottlerGuard } from '../guards/otp-throttler.guard';
import { PublicOtpService } from '../../application/services/public-otp.service';

/**
 * Endpoints de OTP por WhatsApp (login invisible del paciente).
 *
 * Rate limiting: usa OtpThrottlerGuard con tracker `${ip}:${phone}` para que
 * los límites aplique tanto a IP rotando phones como a phone rotando IPs.
 *
 * Límites (declarados con @Throttle, store en memoria):
 *   - request: 3 cada 1 hora (3 OTPs por phone+IP)
 *   - verify:  10 cada 10 min (5 intentos por OTP * holgura)
 */
@Public()
@Controller('public/tenants/:slug/otp')
@UseGuards(OtpThrottlerGuard)
export class PublicOtpController {
  constructor(private readonly service: PublicOtpService) {}

  @Post('request')
  @Throttle({ default: { limit: 3, ttl: 60 * 60 * 1000 } })
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
  @Throttle({ default: { limit: 10, ttl: 10 * 60 * 1000 } })
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
