import { Module } from '@nestjs/common';
import { DoctorsService } from './application/services/doctors.service';
import { DoctorsController } from './infrastructure/adapters/doctors.controller';
import { StorageService } from '../../common/services/storage.service';

@Module({
  controllers: [DoctorsController],
  providers: [DoctorsService, StorageService],
  exports: [DoctorsService],
})
export class DoctorsModule {}
