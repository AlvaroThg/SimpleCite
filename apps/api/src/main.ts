import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Prefijo global para todas las rutas
  app.setGlobalPrefix('api');

  // Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.NODE_ENV === 'production'
      ? [`https://*.${process.env.APP_DOMAIN}`]
      : ['http://localhost:3000'],
    credentials: true,
  });

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
  logger.log(`🚀 SimpleCite API corriendo en http://localhost:${port}/api`);
  logger.log(`📋 Entorno: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap();
