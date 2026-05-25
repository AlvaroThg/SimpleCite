import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Reemplazar el logger por defecto de NestJS con Pino estructurado
  app.useLogger(app.get(Logger));

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

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
