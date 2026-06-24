-- =====================================================================
-- Fase 14 — Productos / mini-inventario de la clínica
-- =====================================================================
-- Tabla products (medicamentos/insumos/otros) con stock y precio.
-- RLS dormante (aislamiento real app-layer por where:{tenantId}).
-- =====================================================================

CREATE TYPE "ProductCategory" AS ENUM ('MEDICATION', 'SUPPLY', 'OTHER');

CREATE TABLE "products" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "sku"               TEXT,
  "category"          "ProductCategory" NOT NULL DEFAULT 'MEDICATION',
  "unit"              TEXT NOT NULL DEFAULT 'unidad',
  "price"             DECIMAL(10,2) NOT NULL DEFAULT 0,
  "stock"             INTEGER NOT NULL DEFAULT 0,
  "lowStockThreshold" INTEGER,
  "isActive"          BOOLEAN NOT NULL DEFAULT true,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "products_name_tenantId_key" ON "products"("name", "tenantId");
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");
CREATE INDEX "products_tenantId_isActive_idx" ON "products"("tenantId", "isActive");

ALTER TABLE "products"
  ADD CONSTRAINT "products_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── RLS dormante (aislamiento por tenant) ───
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_products" ON "products"
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());
