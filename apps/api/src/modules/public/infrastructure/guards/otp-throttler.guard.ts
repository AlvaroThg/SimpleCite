import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Throttler con tracker compuesto IP+phone para endpoints de OTP.
 *
 * Sin esto, un atacante podría:
 *   - Pedir OTPs para muchos teléfonos desde la misma IP (rate limit por IP los detiene).
 *   - Pedir OTPs para el mismo teléfono rotando IPs (rate limit por phone los detiene).
 *
 * Al usar `${ip}:${phone}` como tracker, ambos límites aplican en simultáneo.
 *
 * Nota: el store por defecto es en memoria — funciona para una sola instancia
 * (un solo VPS). Para multi-instancia hace falta @nestjs/throttler-redis.
 */
@Injectable()
export class OtpThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    const ip = this.extractIp(req);
    // El body ya está parseado cuando los guards corren.
    const phone =
      (req.body && typeof req.body === 'object' && (req.body as Record<string, unknown>).phone) ??
      'no-phone';
    return Promise.resolve(`otp:${ip}:${phone}`);
  }

  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip ?? 'unknown';
  }
}
