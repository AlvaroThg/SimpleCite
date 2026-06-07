import { Controller, Get, Patch, Body, Param } from '@nestjs/common';
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

  /** Editar branding (nombre/logo/color). Solo ADMIN. */
  @Patch('current')
  @Roles('ADMIN')
  async updateCurrent(
    @CurrentUser('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(UpdateTenantBrandingSchema)) dto: UpdateTenantBrandingDto,
  ) {
    const data = await this.tenantService.updateBranding(tenantId, dto);
    return { success: true, data };
  }
}
