import { Module } from '@nestjs/common';
import { TenantController } from './infrastructure/adapters/tenant.controller';
import { TenantService } from './application/services/tenant.service';
import { StorageService } from '../../common/services/storage.service';

@Module({
  controllers: [TenantController],
  providers: [TenantService, StorageService],
  exports: [TenantService],
})
export class TenantModule {}
