import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  CreateDoctorSchema,
  UpdateDoctorSchema,
  type CreateDoctorDto,
  type UpdateDoctorDto,
} from '@simplecite/shared';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { DoctorsService } from '../../application/services/doctors.service';

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

  /**
   * Sube el QR de cobro del doctor a R2 (carpeta por slug del tenant).
   * Body: { imageBase64: string, mimeType: string }. El frontend lee el archivo
   * como base64 con FileReader.
   */
  @Roles('ADMIN')
  @Post(':id/qr')
  async uploadQr(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: { imageBase64?: string; mimeType?: string },
  ) {
    if (!body.imageBase64 || !body.mimeType) {
      throw new BadRequestException('imageBase64 y mimeType son requeridos');
    }
    const doctor = await this.doctorsService.uploadQr(
      tenantId,
      id,
      body.imageBase64,
      body.mimeType,
    );
    return { success: true, data: doctor };
  }

  /**
   * Sube la foto del especialista a R2 (mismo patrón base64 que el QR).
   * Body: { imageBase64: string, mimeType: string }.
   */
  @Roles('ADMIN')
  @Post(':id/photo')
  async uploadPhoto(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: { imageBase64?: string; mimeType?: string },
  ) {
    if (!body.imageBase64 || !body.mimeType) {
      throw new BadRequestException('imageBase64 y mimeType son requeridos');
    }
    const doctor = await this.doctorsService.uploadPhoto(
      tenantId,
      id,
      body.imageBase64,
      body.mimeType,
    );
    return { success: true, data: doctor };
  }

  @Roles('ADMIN')
  @Delete(':id')
  async archive(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.doctorsService.archive(tenantId, id);
  }
}
