-- Phase 20 — Modo seguro por especialista + foto del doctor (Addendum G + K).
-- Completamente aditiva: campos nullable o con default; citas existentes quedan
-- con tenantInsuranceId=null y snapshot=null.

-- 1. Método de pago INSURANCE (cobertura por seguro — sin cobro al paciente).
--    PG 16 permite ADD VALUE dentro de la transacción de la migración mientras
--    el valor nuevo no se use en la misma transacción (aquí no se usa).
ALTER TYPE "PaymentMethod" ADD VALUE 'INSURANCE';

-- 2. Catálogo de seguros de la clínica (lo define el admin).
CREATE TABLE "tenant_insurances" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "tenantId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tenant_insurances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_insurances_name_tenantId_key" ON "tenant_insurances"("name", "tenantId");
CREATE INDEX "tenant_insurances_tenantId_idx" ON "tenant_insurances"("tenantId");

ALTER TABLE "tenant_insurances"
  ADD CONSTRAINT "tenant_insurances_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Asignación M:N doctor ↔ seguro (subconjunto del catálogo por doctor).
CREATE TABLE "doctor_insurances" (
  "id"                TEXT NOT NULL,
  "isActive"          BOOLEAN NOT NULL DEFAULT true,
  "doctorId"          TEXT NOT NULL,
  "tenantInsuranceId" TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "doctor_insurances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "doctor_insurances_doctorId_tenantInsuranceId_key" ON "doctor_insurances"("doctorId", "tenantInsuranceId");
CREATE INDEX "doctor_insurances_doctorId_idx" ON "doctor_insurances"("doctorId");
CREATE INDEX "doctor_insurances_tenantInsuranceId_idx" ON "doctor_insurances"("tenantInsuranceId");
CREATE INDEX "doctor_insurances_tenantId_idx" ON "doctor_insurances"("tenantId");

ALTER TABLE "doctor_insurances"
  ADD CONSTRAINT "doctor_insurances_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_insurances"
  ADD CONSTRAINT "doctor_insurances_tenantInsuranceId_fkey"
  FOREIGN KEY ("tenantInsuranceId") REFERENCES "tenant_insurances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_insurances"
  ADD CONSTRAINT "doctor_insurances_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Flag de modo seguro + foto del especialista (Addendum K, misma migración).
ALTER TABLE "doctor_profiles" ADD COLUMN "insuranceMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "doctor_profiles" ADD COLUMN "photoUrl" TEXT;

-- 5. Cita: seguro que la cubre + snapshot inmutable del nombre.
ALTER TABLE "appointments" ADD COLUMN "tenantInsuranceId" TEXT;
ALTER TABLE "appointments" ADD COLUMN "insuranceNameSnapshot" TEXT;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_tenantInsuranceId_fkey"
  FOREIGN KEY ("tenantInsuranceId") REFERENCES "tenant_insurances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
