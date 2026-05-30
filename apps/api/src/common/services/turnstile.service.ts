import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

/**
 * Verifica tokens del widget Cloudflare Turnstile en endpoints públicos.
 *
 * Si `TURNSTILE_SECRET_KEY` no está configurada, la verificación se omite
 * y todos los tokens se consideran válidos — útil en dev/test.
 * En producción `assertProductionInvariants` exige que esté seteada.
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
@Injectable()
export class TurnstileService {
  private readonly endpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  private readonly secret: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {
    this.secret = this.config.get<string>('TURNSTILE_SECRET_KEY');
  }

  /**
   * @returns true si el token es válido (o si Turnstile está deshabilitado).
   *          false ante cualquier fallo de validación.
   */
  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (!this.secret) {
      // Modo dev/test: sin verificación.
      this.logger.debug?.(
        { event: 'turnstile.skip', reason: 'TURNSTILE_SECRET_KEY no configurada' },
        'TurnstileService',
      );
      return true;
    }

    if (!token) {
      this.logger.warn({ event: 'turnstile.rejected', reason: 'token vacío' }, 'TurnstileService');
      return false;
    }

    const body = new URLSearchParams({ secret: this.secret, response: token });
    if (remoteIp) body.append('remoteip', remoteIp);

    try {
      const res = await fetch(this.endpoint, { method: 'POST', body });
      const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };

      if (!data.success) {
        this.logger.warn(
          {
            event: 'turnstile.rejected',
            errors: data['error-codes'] ?? [],
            remoteIp,
          },
          'TurnstileService',
        );
        return false;
      }

      return true;
    } catch (err) {
      // Falla la API de Cloudflare → "fail open" o "fail closed"?
      // Decisión: fail closed en prod, fail open en dev/test.
      // Como el secret está seteado (estamos en prod o staging), fail closed.
      this.logger.error(
        { event: 'turnstile.error', err: (err as Error).message, remoteIp },
        'TurnstileService',
      );
      return false;
    }
  }
}
