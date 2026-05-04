import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { TenantServicePort, TenantEntity } from '../../domain/ports/tenant.port';

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
}
