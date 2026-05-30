import { Controller, Get, Query, NotFoundException } from '@nestjs/common';
import { SlotsQuerySchema, type SlotsQueryDto } from '@simplecite/shared';
import { CurrentTenant, Public } from '../../../../common/decorators';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { PublicTenantService } from '../../application/services/public-tenant.service';

/**
 * Endpoints públicos del tenant. El slug viene en el path y el middleware
 * lo resuelve a tenantId (ver TenantMiddleware estrategia 0).
 *
 * `@Public()` salta el JwtAuthGuard global — estos endpoints NO requieren
 * auth de staff/admin.
 */
@Public()
@Controller('public/tenants/:slug')
export class PublicTenantController {
  constructor(private readonly service: PublicTenantService) {}

  @Get()
  async getInfo(@CurrentTenant() tenantId: string) {
    if (!tenantId) throw new NotFoundException('Tenant no encontrado');
    const info = await this.service.getInfo(tenantId);
    return { success: true, data: info };
  }

  @Get('doctors')
  async listDoctors(@CurrentTenant() tenantId: string) {
    if (!tenantId) throw new NotFoundException('Tenant no encontrado');
    const doctors = await this.service.listDoctorsWithServices(tenantId);
    return { success: true, data: doctors };
  }

  @Get('availability')
  async availability(
    @CurrentTenant() tenantId: string,
    @Query(new ZodValidationPipe(SlotsQuerySchema)) query: SlotsQueryDto,
  ) {
    if (!tenantId) throw new NotFoundException('Tenant no encontrado');
    const slots = await this.service.getAvailability(tenantId, query);
    return { success: true, data: slots };
  }
}
