import { Module } from '@nestjs/common';
import { SlotsService } from './application/services/slots.service';
import { SlotsController } from './infrastructure/adapters/slots.controller';

@Module({
  controllers: [SlotsController],
  providers: [SlotsService],
  exports: [SlotsService],
})
export class SlotsModule {}
