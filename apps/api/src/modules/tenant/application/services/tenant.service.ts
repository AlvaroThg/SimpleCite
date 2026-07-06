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
  secondaryColor: string | null;
  staticQrUrl: string | null;
  staticQrLabel: string | null;
  staticQrUrl2: string | null;
  staticQrLabel2: string | null;
  qrAssignmentMode: 'SHARED' | 'PER_DOCTOR';
  heroImageUrl: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  servicesTitle: string | null;
  specialistsTitle: string | null;
  ctaTitle: string | null;
  ctaSubtitle: string | null;
  address: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  whatsappContact: string | null;
  locationPhotoUrl: string | null;
  mapsUrl: string | null;
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
        secondaryColor: true,
        staticQrUrl: true,
        staticQrLabel: true,
        staticQrUrl2: true,
        staticQrLabel2: true,
        qrAssignmentMode: true,
        heroImageUrl: true,
        heroTitle: true,
        heroSubtitle: true,
        servicesTitle: true,
        specialistsTitle: true,
        ctaTitle: true,
        ctaSubtitle: true,
        address: true,
        facebookUrl: true,
        instagramUrl: true,
        whatsappContact: true,
        locationPhotoUrl: true,
        mapsUrl: true,
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
        ...(dto.secondaryColor !== undefined && { secondaryColor: dto.secondaryColor }),
        ...(dto.staticQrUrl !== undefined && { staticQrUrl: dto.staticQrUrl }),
        ...(dto.staticQrLabel !== undefined && { staticQrLabel: dto.staticQrLabel }),
        ...(dto.staticQrUrl2 !== undefined && { staticQrUrl2: dto.staticQrUrl2 }),
        ...(dto.staticQrLabel2 !== undefined && { staticQrLabel2: dto.staticQrLabel2 }),
        ...(dto.qrAssignmentMode !== undefined && { qrAssignmentMode: dto.qrAssignmentMode }),
        ...(dto.heroImageUrl !== undefined && { heroImageUrl: dto.heroImageUrl }),
        ...(dto.heroTitle !== undefined && { heroTitle: dto.heroTitle }),
        ...(dto.heroSubtitle !== undefined && { heroSubtitle: dto.heroSubtitle }),
        ...(dto.servicesTitle !== undefined && { servicesTitle: dto.servicesTitle }),
        ...(dto.specialistsTitle !== undefined && { specialistsTitle: dto.specialistsTitle }),
        ...(dto.ctaTitle !== undefined && { ctaTitle: dto.ctaTitle }),
        ...(dto.ctaSubtitle !== undefined && { ctaSubtitle: dto.ctaSubtitle }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.facebookUrl !== undefined && { facebookUrl: dto.facebookUrl }),
        ...(dto.instagramUrl !== undefined && { instagramUrl: dto.instagramUrl }),
        ...(dto.whatsappContact !== undefined && { whatsappContact: dto.whatsappContact }),
        ...(dto.mapsUrl !== undefined && { mapsUrl: dto.mapsUrl }),
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
    type: 'logo' | 'static-qr' | 'static-qr-2' | 'hero' | 'location',
    imageBase64: string,
    mimeType: string,
  ): Promise<TenantConfig> {
    // Carpeta por slug (no por id): todo lo de una clínica vive bajo
    // `<slug>/…` en el bucket — fácil de inspeccionar/cargar a mano.
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    const url = await this.storage.uploadImageFromBase64(
      `${tenant.slug}/assets`,
      imageBase64,
      mimeType,
    );

    const FIELD_BY_TYPE: Record<
      typeof type,
      'logoUrl' | 'heroImageUrl' | 'staticQrUrl' | 'staticQrUrl2' | 'locationPhotoUrl'
    > = {
      logo: 'logoUrl',
      hero: 'heroImageUrl',
      'static-qr': 'staticQrUrl',
      'static-qr-2': 'staticQrUrl2',
      location: 'locationPhotoUrl',
    };
    const field = FIELD_BY_TYPE[type];
    await this.prisma.client.tenant.update({
      where: { id: tenantId },
      data: { [field]: url },
    });

    return this.getConfig(tenantId);
  }

  // ───── Galería pública (carrusel de la landing) ─────

  async listGallery(tenantId: string) {
    return this.prisma.client.tenantMedia.findMany({
      where: { tenantId },
      select: { id: true, url: true, type: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Sube una foto o video corto a `<slug>/gallery/` en R2 y lo registra.
   * Solo formatos web-friendly; el límite de tamaño real lo pone el body del
   * API (~8mb ≈ video de ~6MB).
   */
  async uploadGalleryItem(tenantId: string, fileBase64: string, mimeType: string) {
    const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    const VIDEO_MIMES = ['video/mp4', 'video/webm'];
    const isImage = IMAGE_MIMES.includes(mimeType);
    const isVideo = VIDEO_MIMES.includes(mimeType);
    if (!isImage && !isVideo) {
      throw new NotFoundException(
        'Formato no soportado. Imágenes: PNG/JPG/WebP/GIF · Videos: MP4/WebM.',
      );
    }

    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    const url = await this.storage.uploadImageFromBase64(
      `${tenant.slug}/gallery`,
      fileBase64,
      mimeType,
    );
    await this.prisma.client.tenantMedia.create({
      data: { tenantId, url, type: isVideo ? 'VIDEO' : 'IMAGE' },
    });
    return this.listGallery(tenantId);
  }

  async removeGalleryItem(tenantId: string, id: string) {
    const item = await this.prisma.client.tenantMedia.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Elemento de galería no encontrado');
    await this.prisma.client.tenantMedia.delete({ where: { id } });
    return this.listGallery(tenantId);
  }
}
