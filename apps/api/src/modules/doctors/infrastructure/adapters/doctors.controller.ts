import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import {
  CreateDoctorSchema,
  UpdateDoctorSchema,
  type CreateDoctorDto,
  type UpdateDoctorDto,
} from '@simplecite/shared';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import type { DoctorsService } from '../../application/services/doctors.service';

@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Roles('ADMIN')
  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(CreateDoctorSchema)) dto: CreateDoctorDto,
  ) {
    const doctor = await this.doctorsService.create(tenantId, dto);
    return { success: true, data: doctor };
  }

  @Get()
  async list(
    @CurrentUser('tenantId') tenantId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const doctors = await this.doctorsService.findAll(tenantId, {
      includeArchived: includeArchived === 'true',
    });
    return { success: true, data: doctors };
  }

  @Get(':id')
  async findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    const doctor = await this.doctorsService.findById(tenantId, id);
    return { success: true, data: doctor };
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDoctorSchema)) dto: UpdateDoctorDto,
  ) {
    const doctor = await this.doctorsService.update(tenantId, id, dto);
    return { success: true, data: doctor };
  }

  @Roles('ADMIN')
  @Delete(':id')
  async archive(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.doctorsService.archive(tenantId, id);
  }
}
