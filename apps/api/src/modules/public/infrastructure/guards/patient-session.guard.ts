import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { PatientJwtPayload } from '../strategies/patient-jwt.strategy';

/**
 * Guard que protege endpoints públicos de booking que requieren OTP previo.
 *
 * Flujo: el paciente verifica su OTP → recibe sessionToken → lo manda en el
 * Authorization: Bearer header al crear/confirmar appointments.
 *
 * Setea `request.patient` para que los controllers consuman { phone, tenantId }.
 * Como `@Public()` está en el controller (para saltar JwtAuthGuard global),
 * este guard se aplica de forma EXPLICITA en cada endpoint que lo necesita.
 */
@Injectable()
export class PatientSessionGuard extends AuthGuard('patient-jwt') {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const req = context
      .switchToHttp()
      .getRequest<
        Request & {
          user?: PatientJwtPayload;
          patient?: { phone: string; tenantId: string };
          tenantId?: string;
        }
      >();
    const payload = req.user;
    if (!payload || payload.type !== 'patient-session') return false;

    // Remapear a request.patient para no confundirlo con request.user (admin/staff)
    req.patient = { phone: payload.sub, tenantId: payload.tenantId };

    // Verificación defensiva: el tenantId del JWT debe coincidir con el del path.
    // El middleware ya resolvió req.tenantId desde /api/public/tenants/:slug.
    // Si difiere, el paciente está intentando acceder a OTRO tenant con su token.
    if (req.tenantId && req.tenantId !== payload.tenantId) {
      return false;
    }

    return true;
  }
}
