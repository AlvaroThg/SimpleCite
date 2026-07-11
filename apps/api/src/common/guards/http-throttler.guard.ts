import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard solo para contextos HTTP.
 *
 * Los handlers del bot (nestjs-telegraf) también pasan por los APP_GUARD
 * globales, con un ExecutionContext tipo 'telegraf' cuyo "response" es el
 * Context de Telegraf: el ThrottlerGuard base intentaba escribir los headers
 * x-ratelimit-* con `res.header()` y tumbaba cada update entrante
 * ("res.header is not a function"). El rate limit del bot lo impone Telegram.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    return super.shouldSkip(context);
  }
}
