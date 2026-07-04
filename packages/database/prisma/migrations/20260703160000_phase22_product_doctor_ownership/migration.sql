-- Phase 22 — Ownership de productos por doctor (Addendum F, Opción A).
-- null = producto de la clínica (todos lo ven); no-null = privado del doctor.
ALTER TABLE "products" ADD COLUMN "doctorId" TEXT;

ALTER TABLE "products"
  ADD CONSTRAINT "products_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "products_tenantId_doctorId_idx" ON "products"("tenantId", "doctorId");
