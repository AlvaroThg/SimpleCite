import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import {
  CreateServiceSchema,
  UpdateServiceSchema,
  AssignServiceToDoctorSchema,
  UpdateDoctorServiceSchema,
  type CreateServiceDto,
  type UpdateServiceDto,
  type AssignServiceToDoctorDto,
  type UpdateDoctorServiceDto,
} from '@simplecite/shared';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { ServicesService } from '../../application/services/services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  // â”€â”€â”€â”€â”€ CatÃ¡logo del tenant â”€â”€â”€â”€â”€

  @Roles('ADMIN')
  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(CreateServiceSchema)) dto: CreateServiceDto,
  ) {
    const service = await this.servicesService.create(tenantId, dto);
    return { success: true, data: service };
  }

  @Get()
  async list(
    @CurrentUser('tenantId') tenantId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const services = await this.servicesService.findAll(tenantId, {
      includeInactive: includeInactive === 'true',
    });
    return { success: true, data: services };
  }

  @Get(':id')
  async findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    const service = await this.servicesService.findById(tenantId, id);
    return { success: true, data: service };
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateServiceSchema)) dto: UpdateServiceDto,
  ) {
    const service = await this.servicesService.update(tenantId, id, dto);
    return { success: true, data: service };
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.servicesService.remove(tenantId, id);
  }

  // â”€â”€â”€â”€â”€ Asignaciones doctor â†” servicio â”€â”€â”€â”€â”€

  @Roles('ADMIN')
  @Post('doctors/:doctorId/assign')
  async assignToDoctor(
    @CurrentUser('tenantId') tenantId: string,
    @Param('doctorId') doctorId: string,
    @Body(new ZodValidationPipe(AssignServiceToDoctorSchema)) dto: AssignServiceToDoctorDto,
  ) {
    const link = await this.servicesService.assignToDoctor(tenantId, doctorId, dto);
    return { success: true, data: link };
  }

  @Get('doctors/:doctorId')
  async listForDoctor(
    @CurrentUser('tenantId') tenantId: string,
    @Param('doctorId') doctorId: string,
  ) {
    const services = await this.servicesService.listDoctorServices(tenantId, doctorId);
    return { success: true, data: services };
  }

  @Roles('ADMIN')
  @Patch('assignments/:linkId')
  async updateDoctorService(
    @CurrentUser('tenantId') tenantId: string,
    @Param('linkId') linkId: string,
    @Body(new ZodValidationPipe(UpdateDoctorServiceSchema)) dto: UpdateDoctorServiceDto,
  ) {
    const link = await this.servicesService.updateDoctorService(tenantId, linkId, dto);
    return { success: true, data: link };
  }

  @Roles('ADMIN')
  @Delete('assignments/:linkId')
  async unassignFromDoctor(
    @CurrentUser('tenantId') tenantId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.servicesService.unassignFromDoctor(tenantId, linkId);
  }
}
