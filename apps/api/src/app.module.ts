import { randomUUID } from 'node:crypto';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule as CronScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './common/config/env.schema';
import { DatabaseModule } from './common/database/database.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { RollingSessionInterceptor } from './common/interceptors/rolling-session.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';
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
import { WhatsappCloudModule } from './modules/whatsapp-cloud/whatsapp-cloud.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ReportsModule } from './modules/reports/reports.module';
import { BillingModule } from './modules/billing/billing.module';
import { MedicalRecordsModule } from './modules/medical-records/medical-records.module';
import { ProductsModule } from './modules/products/products.module';
import { InsurancesModule } from './modules/insurances/insurances.module';

/**
 * Lo que pino-http ve de una request. Es más chico que `express.Request`
 * (pino recibe el `IncomingMessage` crudo) y lleva lo que le añaden el
 * TenantMiddleware y el JwtAuthGuard.
 */
interface LoggedRequest {
  headers: Record<string, string | string[] | undefined>;
  tenantId?: string;
  user?: { sub?: string };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Falla RÁPIDO y claro si falta una env crítica (ver env.schema.ts).
      validate: validateEnv,
      // Rutas relativas al CWD. Al correr vía Turbo el CWD es apps/api, por eso
      // se incluyen también las variantes de la raíz del monorepo (../../). El
      // primer archivo que define cada clave gana, así que el .env.<entorno>
      // (completo) tiene prioridad sobre el .env de raíz (que puede ser parcial).
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        `../../.env.${process.env.NODE_ENV ?? 'development'}.local`,
        `../../.env.${process.env.NODE_ENV ?? 'development'}`,
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
        customProps: (req: LoggedRequest) => ({
          tenantId: req.tenantId,
          userId: req.user?.sub,
        }),
        // Ocultar datos sensibles. Los logs de una clínica terminan en un
        // agregador y los mira gente que no debería ver ni credenciales ni
        // datos identificables de pacientes. Se enumera explícitamente cada
        // ruta porque pino no soporta comodines de profundidad arbitraria.
        redact: {
          paths: [
            // ── Credenciales y tokens ──
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-internal-secret"]',
            'req.headers["x-hub-signature-256"]',
            'res.headers["set-cookie"]',
            'req.body.password',
            'req.body.turnstileToken',
            'req.body.code', // OTP en claro
            'req.body.imageBase64', // fotos/QR/comprobantes: ruido y datos
            'req.body.fileBase64',
            // ── Datos identificables de paciente (PII) ──
            'req.body.ci',
            'req.body.phone',
            'req.body["patient"].ci',
            'req.body["patient"].phone',
            'req.query.ci',
            // ── Contenido clínico: nunca al log ──
            'req.body.symptoms',
            'req.body.diagnosis',
            'req.body.treatment',
            'req.body.privateNotes',
            'req.body.content',
            'req.body.medications',
            'req.body.instructions',
          ],
          censor: '[redacted]',
        },
        // Nivel mínimo de log
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        // Formato del requestId
        genReqId: (req: LoggedRequest) => req.headers['x-request-id'] ?? randomUUID(),
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
    // 300/min por IP: una clínica NATea a todo su staff tras una sola IP
    // pública y cada pantalla del panel dispara varias llamadas en paralelo
    // (citas + pacientes + doctores + servicios + slots). Con 100 el uso
    // normal de recepción ya rozaba el 429.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),

    // Registro de crons (@Cron). Vive AQUÍ (no en un módulo flaggeable):
    // la limpieza de citas TENTATIVE (AppointmentsCleanupService) depende de él.
    CronScheduleModule.forRoot(),

    DatabaseModule,
    HealthModule,
    TenantModule,
    AuthModule,
    DoctorsModule,
    ServicesModule,
    ScheduleModule,
    AppointmentsModule,
    SlotsModule,
    PatientsModule,
    PublicModule,
    // WhatsApp: Cloud API oficial de Meta, un solo número para toda la
    // plataforma. Se carga siempre (registra el webhook entrante y el envío
    // saliente); sin las META_WA_* es inerte — no envía nada, best-effort.
    //
    // Reemplazó al orquestador Baileys (un contenedor por clínica), que se
    // eliminó: exigía el socket de Docker montado en el API y nunca llegó a
    // desplegarse en producción.
    WhatsappCloudModule,
    ReportsModule,
    BillingModule,
    MedicalRecordsModule,
    ProductsModule,
    InsurancesModule,
  ],
  providers: [
    // ── Orden de ejecución de guards globales ──
    // 1. HttpThrottlerGuard: rate limit antes que cualquier otra lógica
    //    (solo HTTP: los updates de Telegraf no deben pasar por aquí).
    {
      provide: APP_GUARD,
      useClass: HttpThrottlerGuard,
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
    // Sesión deslizante: refresca la cookie del panel con la actividad para
    // que un usuario activo no se caiga por expiración del JWT.
    {
      provide: APP_INTERCEPTOR,
      useClass: RollingSessionInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // TenantMiddleware resuelve tenantId antes que los guards
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
