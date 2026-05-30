import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SlotsModule } from '../slots/slots.module';

import { PublicTenantService } from './application/services/public-tenant.service';
import { PublicOtpService } from './application/services/public-otp.service';
import { PublicBookingService } from './application/services/public-booking.service';

import { PublicTenantController } from './infrastructure/adapters/public-tenant.controller';
import { PublicOtpController } from './infrastructure/adapters/public-otp.controller';
import { PublicBookingController } from './infrastructure/adapters/public-booking.controller';

import { PatientJwtStrategy } from './infrastructure/strategies/patient-jwt.strategy';

import { TurnstileService } from '../../common/services/turnstile.service';
import { WhatsAppService } from '../../common/services/whatsapp.service';

/**
 * Módulo de la API pública (booking + OTP + tenant info).
 *
 * - Usa un JwtModule SEPARADO del de auth (admin/staff) — secret distinto,
 *   TTL más corto. Esto reduce el blast radius si un secret se filtra.
 * - Reusa SlotsService para disponibilidad.
 * - Expone TurnstileService y WhatsAppService como providers de scope local
 *   (no son globales — quien los necesite los importa via PublicModule).
 */
@Module({
  imports: [
    SlotsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('PATIENT_JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('PATIENT_SESSION_TTL') ??
            '30m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
  ],
  controllers: [PublicTenantController, PublicOtpController, PublicBookingController],
  providers: [
    PublicTenantService,
    PublicOtpService,
    PublicBookingService,
    PatientJwtStrategy,
    TurnstileService,
    WhatsAppService,
  ],
})
export class PublicModule {}
