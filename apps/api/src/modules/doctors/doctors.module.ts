import { Module } from '@nestjs/common';
import { DoctorsService } from './application/services/doctors.service';
import { DoctorsController } from './infrastructure/adapters/doctors.controller';

@Module({
  controllers: [DoctorsController],
  providers: [DoctorsService],
  exports: [DoctorsService],
})
export class DoctorsModule {}
