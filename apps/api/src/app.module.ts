import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './common/database/database.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthModule } from './modules/health/health.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AuthModule } from './modules/auth/auth.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { ServicesModule } from './modules/services/services.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { SlotsModule } from './modules/slots/slots.module';
import { PublicModule } from './modules/public/public.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { PaymentsModule } from './modules/payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env.local',
        '.env',
        '../../.env',
      ],
    }),

    // Logging estructurado con Pino
    LoggerModule.forRoot({
      pinoHttp: {
        // En desarrollo: pretty-print legible; en producción: JSON estructurado
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
            : undefined,
        // Campos que se loguean por defecto en cada request
        customProps: (req: any) => ({
          tenantId: req.tenantId,
          userId: req.user?.sub,
        }),
        // Ocultar datos sensibles
        redact: ['req.headers.authorization', 'req.body.password'],
        // Nivel mínimo de log
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        // Formato del requestId
        genReqId: (req: any) => req.headers['x-request-id'] ?? crypto.randomUUID(),
        serializers: {
          req(req) {
            return {
              id: req.id,
              method: req.method,
              url: req.url,
              tenantId: req.raw?.tenantId,
              userId: req.raw?.user?.sub,
            };
          },
        },
      },
    }),

    // Rate limiting global — store en memoria (suficiente para single-VPS).
    // Para multi-instancia: cambiar storage a @nestjs/throttler-storage-redis.
    // El default abarca tráfico general; los endpoints OTP/booking declaran
    // límites más estrictos via @Throttle() en sus controllers.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 }, // 100 req/min por IP
    ]),

    DatabaseModule,
    HealthModule,
    TenantModule,
    AuthModule,
    DoctorsModule,
    ServicesModule,
    ScheduleModule,
    AppointmentsModule,
    SlotsModule,
    PublicModule,
    WhatsappModule,
    PaymentsModule,
  ],
  providers: [
    // ── Orden de ejecución de guards globales ──
    // 1. ThrottlerGuard: rate limit antes que cualquier otra lógica
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // 2. JwtAuthGuard: valida Bearer token → inyecta request.user
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // 3. TenantGuard: valida que el tenant está activo
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    // 4. RolesGuard: valida RBAC (@Roles() decorator)
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Interceptor RLS — envuelve handler en tx con set_config
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // TenantMiddleware resuelve tenantId antes que los guards
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
