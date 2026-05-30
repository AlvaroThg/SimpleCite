import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * Payload del JWT de sesión de paciente.
 * Separado del JWT de admin/staff/doctor — secret distinto, scope distinto.
 */
export interface PatientJwtPayload {
  sub: string; /// phone E.164 sin '+'
  tenantId: string; /// tenant al que pertenece esta sesión
  type: 'patient-session'; /// discriminador defensivo: si se cuela en otro guard, falla
  iat?: number;
  exp?: number;
}

@Injectable()
export class PatientJwtStrategy extends PassportStrategy(Strategy, 'patient-jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('PATIENT_JWT_SECRET');
    if (!secret) {
      throw new Error('PATIENT_JWT_SECRET no está configurada');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Validación adicional al payload decodificado.
   * Lo que retorne acá NestJS lo inyecta en `request.user` (vía Passport),
   * pero como queremos diferenciarlo del User de staff, el guard lo
   * remapea a `request.patient`.
   */
  validate(payload: PatientJwtPayload): PatientJwtPayload {
    if (payload.type !== 'patient-session') {
      throw new UnauthorizedException('Token de sesión inválido');
    }
    return payload;
  }
}
