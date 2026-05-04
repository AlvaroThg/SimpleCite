import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TenantMiddleware } from '../../common/middleware/tenant.middleware';
import { TenantController } from './infrastructure/adapters/tenant.controller';
import { TenantService } from './application/services/tenant.service';

@Module({
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Aplicar TenantMiddleware a todas las rutas excepto health y auth
    consumer
      .apply(TenantMiddleware)
      .exclude('api/health', 'api/auth/(.*)')
      .forRoutes('*');
  }
}
