import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateProductSchema,
  UpdateProductSchema,
  AdjustStockSchema,
  type CreateProductDto,
  type UpdateProductDto,
  type AdjustStockDto,
} from '@simplecite/shared';
import { CurrentUser, Roles } from '../../../../common/decorators';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { SubscriptionGuard } from '../../../billing/infrastructure/guards/subscription.guard';
import { ProductsService } from '../../application/services/products.service';

/**
 * Inventario de productos (panel). Requiere suscripción vigente.
 *   GET    /products            → listado (ADMIN/DOCTOR/STAFF)
 *   POST   /products            → crear (ADMIN)
 *   PATCH  /products/:id        → editar (ADMIN)
 *   POST   /products/:id/stock  → ajuste de stock +/- (ADMIN/STAFF)
 *   DELETE /products/:id        → archivar (ADMIN)
 */
@UseGuards(SubscriptionGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Roles('ADMIN', 'DOCTOR', 'STAFF')
  async list(
    @CurrentUser('tenantId') tenantId: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('q') q?: string,
  ) {
    const data = await this.products.list(tenantId, {
      includeInactive: includeInactive === 'true',
      q,
    });
    return { success: true, data };
  }

  @Post()
  @Roles('ADMIN')
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(CreateProductSchema)) dto: CreateProductDto,
  ) {
    const data = await this.products.create(tenantId, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProductSchema)) dto: UpdateProductDto,
  ) {
    const data = await this.products.update(tenantId, id, dto);
    return { success: true, data };
  }

  @Post(':id/stock')
  @Roles('ADMIN', 'STAFF')
  async adjustStock(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdjustStockSchema)) dto: AdjustStockDto,
  ) {
    const data = await this.products.adjustStock(tenantId, id, dto.delta);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async archive(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    const data = await this.products.archive(tenantId, id);
    return { success: true, data };
  }
}
