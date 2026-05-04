import { Controller, Get, Param } from '@nestjs/common';
import { TenantService } from '../../application/services/tenant.service';

@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  /**
   * GET /api/tenants/slug/:slug
   * Resuelve un tenant por su slug (usado por el frontend para subdominios).
   * Esta ruta es pública — no requiere autenticación.
   */
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
}
