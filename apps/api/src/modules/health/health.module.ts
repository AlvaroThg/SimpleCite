import { Module } from '@nestjs/common';
import { HealthController } from './infrastructure/adapters/health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
