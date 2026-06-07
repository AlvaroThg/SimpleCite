import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateTenantBrandingDto } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';
import { TenantServicePort, TenantEntity } from '../../domain/ports/tenant.port';

/** Forma pública de la configuración del tenant (para el panel). */
export interface TenantConfig {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  timezone: string;
  plan: string;
  whatsappEnabled: boolean;
}

/**
 * Implementación del servicio de Tenant.
 * Orquesta los use cases del dominio Tenant.
 */
@Injectable()
export class TenantService implements TenantServicePort {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string): Promise<TenantEntity | null> {
    return this.prisma.tenant.findUnique({
      where: { slug },
    });
  }

  async findById(id: string): Promise<TenantEntity | null> {
    return this.prisma.tenant.findUnique({
      where: { id },
    });
  }

  async findByIdOrFail(id: string): Promise<TenantEntity> {
    const tenant = await this.findById(id);
    if (!tenant) {
      throw new NotFoundException(`Tenant con ID "${id}" no encontrado`);
    }
    return tenant;
  }

  /** Configuración del tenant para el panel (datos no sensibles). */
  async getConfig(tenantId: string): Promise<TenantConfig> {
    const t = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        logoUrl: true,
        primaryColor: true,
        timezone: true,
        plan: true,
        whatsappEnabled: true,
      },
    });
    if (!t) throw new NotFoundException('Tenant no encontrado');
    return t;
  }

  /** Actualiza branding (nombre/logo/color). Solo campos provistos. */
  async updateBranding(tenantId: string, dto: UpdateTenantBrandingDto): Promise<TenantConfig> {
    await this.prisma.client.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
      },
    });
    return this.getConfig(tenantId);
  }
}
