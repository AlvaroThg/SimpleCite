import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateTenantBrandingDto } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';
import { StorageService } from '../../../../common/services/storage.service';
import { TenantServicePort, TenantEntity } from '../../domain/ports/tenant.port';

/** Forma pública de la configuración del tenant (para el panel). */
export interface TenantConfig {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  staticQrUrl: string | null;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

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
        staticQrUrl: true,
        timezone: true,
        plan: true,
        whatsappEnabled: true,
      },
    });
    if (!t) throw new NotFoundException('Tenant no encontrado');
    return t;
  }

  /** Actualiza branding (nombre/logo/color/QR). Solo campos provistos. */
  async updateBranding(tenantId: string, dto: UpdateTenantBrandingDto): Promise<TenantConfig> {
    await this.prisma.client.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
        ...(dto.staticQrUrl !== undefined && { staticQrUrl: dto.staticQrUrl }),
      },
    });
    return this.getConfig(tenantId);
  }

  /**
   * Sube un asset (logo o QR estático) a Supabase Storage y actualiza el tenant.
   * @param type 'logo' | 'static-qr'
   */
  async uploadAsset(
    tenantId: string,
    type: 'logo' | 'static-qr',
    imageBase64: string,
    mimeType: string,
  ): Promise<TenantConfig> {
    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const path = `${tenantId}/${type}.${ext}`;
    const url = await this.storage.uploadFromBase64('assets', path, imageBase64, mimeType);

    const field = type === 'logo' ? 'logoUrl' : 'staticQrUrl';
    await this.prisma.client.tenant.update({
      where: { id: tenantId },
      data: { [field]: url },
    });

    return this.getConfig(tenantId);
  }
}
