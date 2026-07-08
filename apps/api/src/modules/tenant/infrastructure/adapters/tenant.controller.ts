import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { UpdateTenantBrandingSchema, type UpdateTenantBrandingDto } from '@simplecite/shared';
import { Public } from '../../../../common/decorators/public.decorator';
import { CurrentUser, Roles } from '../../../../common/decorators';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { TenantService } from '../../application/services/tenant.service';

@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Public()
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const tenant = await this.tenantService.findBySlug(slug);

    if (!tenant) {
      return { success: false, error: 'Clínica no encontrada' };
    }

    // Retornar solo datos públicos (no sensibles)
    return {
      success: true,
      data: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        logoUrl: tenant.logoUrl,
        primaryColor: tenant.primaryColor,
        plan: tenant.plan,
      },
    };
  }

  /** Config del tenant autenticado (panel). El tenantId sale del JWT. */
  @Get('current')
  @Roles('ADMIN', 'DOCTOR', 'STAFF')
  async getCurrent(@CurrentUser('tenantId') tenantId: string) {
    const data = await this.tenantService.getConfig(tenantId);
    return { success: true, data };
  }

  /** Editar branding (nombre/logo/color/QR). Solo ADMIN. */
  @Patch('current')
  @Roles('ADMIN')
  async updateCurrent(
    @CurrentUser('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(UpdateTenantBrandingSchema)) dto: UpdateTenantBrandingDto,
  ) {
    const data = await this.tenantService.updateBranding(tenantId, dto);
    return { success: true, data };
  }

  /**
   * Sube un asset (logo o QR estático) a Supabase Storage.
   * Body: { type: 'logo' | 'static-qr', imageBase64: string, mimeType: string }
   * El frontend lee el archivo como base64 con FileReader.
   */
  @Post('current/assets')
  @Roles('ADMIN')
  async uploadAsset(
    @CurrentUser('tenantId') tenantId: string,
    @Body()
    body: {
      type: 'logo' | 'static-qr' | 'static-qr-2' | 'hero' | 'location';
      imageBase64: string;
      mimeType: string;
    },
  ) {
    const { type, imageBase64, mimeType } = body;
    if (!['logo', 'static-qr', 'static-qr-2', 'hero', 'location'].includes(type)) {
      throw new BadRequestException(
        'type debe ser "logo", "static-qr", "static-qr-2", "hero" o "location"',
      );
    }
    if (!imageBase64 || !mimeType) {
      throw new BadRequestException('imageBase64 y mimeType son requeridos');
    }
    const data = await this.tenantService.uploadAsset(tenantId, type, imageBase64, mimeType);
    return { success: true, data };
  }

  // ───── Galería pública (carrusel de la landing) ─────

  @Get('current/gallery')
  @Roles('ADMIN')
  async listGallery(@CurrentUser('tenantId') tenantId: string) {
    const data = await this.tenantService.listGallery(tenantId);
    return { success: true, data };
  }

  /** Sube foto o video corto (base64) a la galería. */
  @Post('current/gallery')
  @Roles('ADMIN')
  async uploadGalleryItem(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { fileBase64?: string; mimeType?: string },
  ) {
    if (!body.fileBase64 || !body.mimeType) {
      throw new BadRequestException('fileBase64 y mimeType son requeridos');
    }
    const data = await this.tenantService.uploadGalleryItem(
      tenantId,
      body.fileBase64,
      body.mimeType,
    );
    return { success: true, data };
  }

  /** Reordena la galería (drag & drop del panel): lista de ids en orden. */
  @Patch('current/gallery/order')
  @Roles('ADMIN')
  async reorderGallery(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { ids?: string[] },
  ) {
    if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string')) {
      throw new BadRequestException('ids debe ser una lista de ids');
    }
    const data = await this.tenantService.reorderGallery(tenantId, body.ids);
    return { success: true, data };
  }

  @Delete('current/gallery/:id')
  @Roles('ADMIN')
  async removeGalleryItem(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    const data = await this.tenantService.removeGalleryItem(tenantId, id);
    return { success: true, data };
  }
}
