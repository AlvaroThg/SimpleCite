import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { ProductsService } from './application/services/products.service';
import { ProductsController } from './infrastructure/adapters/products.controller';

/** Mini-inventario de productos de la clínica (medicamentos, insumos, otros). */
@Module({
  imports: [BillingModule], // SubscriptionGuard
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
