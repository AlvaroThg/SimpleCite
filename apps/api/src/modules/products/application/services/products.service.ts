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

  async list(
    tenantId: string,
    opts: {
      includeInactive?: boolean;
      q?: string;
      /// Filtro del admin: 'clinic' = solo de la clínica; uuid = de ese doctor.
      doctorId?: string;
      /// Scope por rol (Opción A): un DOCTOR solo ve los productos de la
      /// clínica (doctorId=null) más los suyos propios.
      requester?: { userId: string; role: string };
    } = {},
  ) {
    const q = opts.q?.trim();
    const doctorScope =
      opts.requester?.role === 'DOCTOR'
        ? { OR: [{ doctorId: null }, { doctorId: opts.requester.userId }] }
        : opts.doctorId === 'clinic'
          ? { doctorId: null }
          : opts.doctorId
            ? { doctorId: opts.doctorId }
            : {};
    return this.prisma.client.product.findMany({
      where: {
        tenantId,
        ...(opts.includeInactive ? {} : { isActive: true }),
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
        ...doctorScope,
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

    // Producto privado de un doctor: validar que el doctor es del tenant.
    if (dto.doctorId) {
      const doctor = await this.prisma.client.user.findFirst({
        where: { id: dto.doctorId, tenantId, role: 'DOCTOR' },
        select: { id: true },
      });
      if (!doctor) throw new NotFoundException('Doctor no encontrado');
    }
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

  /**
   * Eliminación definitiva. Es segura: las recetas guardan nombre y dosis en su
   * propio JSON (el productId colgante solo desactiva el autocompletado). Para
   * "sacar de circulación" sin borrar, usar isActive:false (PATCH).
   */
  async remove(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    await this.prisma.client.product.delete({ where: { id } });
    return { success: true };
  }
}
