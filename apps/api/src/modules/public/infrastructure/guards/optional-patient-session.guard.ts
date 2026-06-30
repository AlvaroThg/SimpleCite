import { Injectable, CanActivate, ExecutionContext, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PatientSessionGuard } from './patient-session.guard';
import { normalizePhone } from '../../../../common/utils/phone';

/**
 * Guard de booking público con dos modos, según `PUBLIC_BOOKING_REQUIRE_OTP`:
 *
 *  - `true`  → modo OTP (bot de WhatsApp activo, rama `develop`): delega en
 *    `PatientSessionGuard`, que exige el JWT de paciente obtenido tras verificar
 *    el OTP. El phone sale del JWT.
 *  - `false` (default, rama `main` sin bot) → modo abierto: NO exige OTP. El
 *    phone viaja en el body de la request. El anti-bot (Turnstile) y el rate
 *    limit por teléfono se aplican en `PublicBookingService.createTentative`.
 *
 * En ambos modos deja `request.patient = { phone, tenantId }` para que los
 * controllers consuman `@CurrentPatient('phone')` sin ramificar.
 *
 * Reactivar OTP es solo poner el flag en `true` (o mergear el flujo de bot
 * desde `develop`): nada de este código se borra.
 */
@Injectable()
export class OptionalPatientSessionGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly patientGuard: PatientSessionGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireOtp = this.config.get<string>('PUBLIC_BOOKING_REQUIRE_OTP') === 'true';
    if (requireOtp) {
      return (await this.patientGuard.canActivate(context)) as boolean;
    }

    const req = context.switchToHttp().getRequest<
      Request & {
        patient?: { phone: string; tenantId: string };
        tenantId?: string;
        body?: { phone?: string };
      }
    >();

    const rawPhone = req.body?.phone;
    if (!rawPhone) throw new BadRequestException('El número de teléfono es obligatorio');

    req.patient = { phone: normalizePhone(rawPhone), tenantId: req.tenantId ?? '' };
    return true;
  }
}
