import { Module } from '@nestjs/common';
import { ServicesService } from './application/services/services.service';
import { ServicesController } from './infrastructure/adapters/services.controller';

@Module({
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
