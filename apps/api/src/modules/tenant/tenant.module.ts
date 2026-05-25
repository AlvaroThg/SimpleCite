import { Module } from '@nestjs/common';
import { TenantController } from './infrastructure/adapters/tenant.controller';
import { TenantService } from './application/services/tenant.service';

@Module({
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
