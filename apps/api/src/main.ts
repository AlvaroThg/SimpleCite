import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true expone req.rawBody (Buffer) — necesario para validar la
  // firma HMAC del webhook de pagos sobre el cuerpo crudo (no re-serializado).
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  // Reemplazar el logger por defecto de NestJS con Pino estructurado
  app.useLogger(app.get(Logger));

  app.setGlobalPrefix('api');

  // No hay ValidationPipe global — toda la validación se hace con ZodValidationPipe
  // aplicado explícitamente en cada controller. Un ValidationPipe global con
  // whitelist: true + forbidNonWhitelisted: true rechaza payloads válidos porque
  // los DTOs de Zod no tienen decoradores de class-validator.

  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? [`https://*.${process.env.APP_DOMAIN}`]
        : ['http://localhost:3000'],
    credentials: true,
  });

  const port = process.env.API_PORT || 3001;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`SimpleCite API corriendo en http://localhost:${port}/api`, 'Bootstrap');
  logger.log(`Entorno: ${process.env.NODE_ENV ?? 'development'}`, 'Bootstrap');
}

bootstrap();
