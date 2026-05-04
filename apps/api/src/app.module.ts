import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './common/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    // Carga variables de entorno globalmente
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),

    // Módulos de infraestructura
    DatabaseModule,

    // Módulos de dominio
    HealthModule,
    TenantModule,
    AuthModule,
  ],
})
export class AppModule {}
