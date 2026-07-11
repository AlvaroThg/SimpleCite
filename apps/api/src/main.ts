// Primero SIEMPRE: puebla process.env desde los .env antes de que los
// decoradores de módulos evalúen sus feature flags (ver load-env.ts).
import './common/config/load-env';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true expone req.rawBody (Buffer) — necesario para validar la
  // firma HMAC del webhook de pagos sobre el cuerpo crudo (no re-serializado).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // Límite de body JSON: las imágenes (logo, QR, fotos) viajan en base64
  // dentro del JSON. El default de Express (100kb) rechazaba cualquier foto
  // real con 413. 8mb cubre fotos de celular; R2 recibe el binario después.
  app.useBodyParser('json', { limit: '8mb' });

  // Reemplazar el logger por defecto de NestJS con Pino estructurado
  app.useLogger(app.get(Logger));

  app.setGlobalPrefix('api');

  // Headers de seguridad HTTP (API JSON puro: la CSP no aplica a respuestas
  // de datos, pero X-Content-Type-Options, HSTS y compañía sí).
  app.use(helmet({ contentSecurityPolicy: false }));

  // No hay ValidationPipe global — toda la validación se hace con ZodValidationPipe
  // aplicado explícitamente en cada controller. Un ValidationPipe global con
  // whitelist: true + forbidNonWhitelisted: true rechaza payloads válidos porque
  // los DTOs de Zod no tienen decoradores de class-validator.

  // En prod: el apex y cualquier subdominio del APP_DOMAIN sobre http/https.
  // OJO: el paquete `cors` NO interpreta `*` en un string; hay que usar RegExp.
  const appDomain = (process.env.APP_DOMAIN ?? 'simplecite.com.bo').replace(/[.]/g, '\\.');
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? [new RegExp(`^https?://([a-z0-9-]+\\.)*${appDomain}$`)]
        : ['http://localhost:3000'],
    credentials: true,
  });

  // Graceful shutdown: con SIGTERM (rolling deploy de Docker/Dokploy) Nest
  // deja de aceptar conexiones, drena las activas y dispara onModuleDestroy
  // (PrismaService cierra su pool). Sin esto, cada deploy corta requests vivos.
  app.enableShutdownHooks();

  const port = process.env.API_PORT || 3001;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`SimpleCite API corriendo en http://localhost:${port}/api`, 'Bootstrap');
  logger.log(`Entorno: ${process.env.NODE_ENV ?? 'development'}`, 'Bootstrap');
}

bootstrap();
