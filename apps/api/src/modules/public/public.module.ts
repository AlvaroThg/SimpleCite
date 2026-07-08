import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SlotsModule } from '../slots/slots.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PatientsModule } from '../patients/patients.module';
import { BillingModule } from '../billing/billing.module';
import { AppointmentsModule } from '../appointments/appointments.module';

import { PublicTenantService } from './application/services/public-tenant.service';
import { PublicOtpService } from './application/services/public-otp.service';
import { PublicBookingService } from './application/services/public-booking.service';

import { PublicTenantController } from './infrastructure/adapters/public-tenant.controller';
import { PublicOtpController } from './infrastructure/adapters/public-otp.controller';
import { PublicBookingController } from './infrastructure/adapters/public-booking.controller';
import { PublicCancellationController } from './infrastructure/adapters/public-cancellation.controller';

import { PatientJwtStrategy } from './infrastructure/strategies/patient-jwt.strategy';
import { PatientSessionGuard } from './infrastructure/guards/patient-session.guard';
import { OptionalPatientSessionGuard } from './infrastructure/guards/optional-patient-session.guard';

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
    // Bot de WhatsApp: solo con el flag activo. Sin él, WhatsAppService y
    // PublicBookingService reciben WaMessageService como @Optional (no envían).
    ...(process.env.ENABLE_WHATSAPP === 'true' ? [WhatsappModule] : []),
    PatientsModule,
    BillingModule,
    AppointmentsModule,
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
  controllers: [
    PublicTenantController,
    PublicOtpController,
    PublicBookingController,
    PublicCancellationController,
  ],
  providers: [
    PublicTenantService,
    PublicOtpService,
    PublicBookingService,
    PatientJwtStrategy,
    PatientSessionGuard,
    OptionalPatientSessionGuard,
    TurnstileService,
    WhatsAppService,
  ],
})
export class PublicModule {}
