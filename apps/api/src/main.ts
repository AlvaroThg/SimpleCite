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

  // Detrás del reverse proxy (Traefik/Dokploy) Express veía la IP del proxy en
  // TODAS las requests: el rate limit, que cuenta por IP, se volvía un cupo
  // único para toda la plataforma (el staff de una clínica, los pacientes de
  // la landing y el bot compartían los mismos 100 req/min → 429 haciendo
  // trabajo normal). Con 'trust proxy' = 1 se confía en el primer salto y
  // req.ip pasa a ser la IP real del cliente (X-Forwarded-For).
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');

  // Headers de seguridad HTTP. El API sirve JSON y PDFs, nunca HTML: en vez de
  // apagar la CSP se declara la más restrictiva posible (`default-src 'none'`).
  // No cambia nada para los clientes legítimos —ni fetch ni la descarga de un
  // PDF pasan por la CSP del API—, pero si algún día una respuesta se renderiza
  // como documento (un error de framework, un `Content-Type` mal puesto, un
  // texto de paciente reflejado), el navegador no ejecuta nada de lo que venga
  // dentro. La CSP del frontend la sirve Next.js por su lado.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
        },
      },
    }),
  );

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
