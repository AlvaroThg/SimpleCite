import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import type { CreateProductDto, UpdateProductDto } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';

/**
 * Mini-inventario de la clínica: medicamentos, insumos u otros vendibles.
 * MVP: CRUD + ajuste manual de stock + alerta de stock bajo. Aislamiento por
 * tenant en cada query (RLS dormante).
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, opts: { includeInactive?: boolean; q?: string } = {}) {
    const q = opts.q?.trim();
    return this.prisma.client.product.findMany({
      where: {
        tenantId,
        ...(opts.includeInactive ? {} : { isActive: true }),
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateProductDto) {
    const existing = await this.prisma.client.product.findFirst({
      where: { name: dto.name, tenantId },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`Ya existe un producto "${dto.name}"`);
    return this.prisma.client.product.create({ data: { ...dto, tenantId } });
  }

  async findById(tenantId: string, id: string) {
    const product = await this.prisma.client.product.findFirst({ where: { id, tenantId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    await this.findById(tenantId, id);
    return this.prisma.client.product.update({ where: { id }, data: dto });
  }

  /** Ajuste manual de existencias (+/-). El stock nunca baja de 0. */
  async adjustStock(tenantId: string, id: string, delta: number) {
    const product = await this.findById(tenantId, id);
    const stock = Math.max(0, product.stock + delta);
    return this.prisma.client.product.update({ where: { id }, data: { stock } });
  }

  async archive(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    await this.prisma.client.product.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }
}
