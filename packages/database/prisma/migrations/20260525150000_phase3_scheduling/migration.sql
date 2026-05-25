-- ============================================
-- Fase 3 — Scheduling, Services junction, Slots
-- Doctor services + weekly schedule + blocks + exclusion constraint anti-overlap.
-- ============================================

-- CreateTable: doctor_services
CREATE TABLE "doctor_services" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customDuration" INTEGER,
    "customPrice" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable: doctor_schedule_rules
CREATE TABLE "doctor_schedule_rules" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_schedule_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: doctor_schedule_blocks
CREATE TABLE "doctor_schedule_blocks" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_schedule_blocks_pkey" PRIMARY KEY ("id")
);

-- ─── Índices ───
CREATE INDEX "doctor_services_tenantId_idx" ON "doctor_services"("tenantId");
CREATE INDEX "doctor_services_tenantId_doctorId_idx" ON "doctor_services"("tenantId", "doctorId");
CREATE UNIQUE INDEX "doctor_services_doctorId_serviceId_key" ON "doctor_services"("doctorId", "serviceId");

CREATE INDEX "doctor_schedule_rules_tenantId_idx" ON "doctor_schedule_rules"("tenantId");
CREATE INDEX "doctor_schedule_rules_tenantId_doctorId_dayOfWeek_idx" ON "doctor_schedule_rules"("tenantId", "doctorId", "dayOfWeek");

CREATE INDEX "doctor_schedule_blocks_tenantId_doctorId_idx" ON "doctor_schedule_blocks"("tenantId", "doctorId");
CREATE INDEX "doctor_schedule_blocks_startTime_endTime_idx" ON "doctor_schedule_blocks"("startTime", "endTime");

-- ─── Foreign Keys ───
ALTER TABLE "doctor_services" ADD CONSTRAINT "doctor_services_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_services" ADD CONSTRAINT "doctor_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "doctor_schedule_rules" ADD CONSTRAINT "doctor_schedule_rules_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "doctor_schedule_blocks" ADD CONSTRAINT "doctor_schedule_blocks_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Exclusion constraint: anti doble-reserva ───
-- Requiere btree_gist para combinar columnas scalar (=) con range (&&) en GIST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Para cada (tenantId, doctorId), tsrange(startTime, endTime) NO puede solapar.
-- Solo aplica a citas activas (PENDING_PAYMENT, CONFIRMED) — citas canceladas no bloquean.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap_per_doctor"
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "doctorId" WITH =,
    tsrange("startTime", "endTime", '[)') WITH &&
  )
  WHERE (status IN ('PENDING_PAYMENT', 'CONFIRMED'));

-- ─── RLS para las nuevas tablas ───
ALTER TABLE doctor_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_services FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_doctor_services" ON doctor_services
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE doctor_schedule_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedule_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_doctor_schedule_rules" ON doctor_schedule_rules
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE doctor_schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedule_blocks FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_doctor_schedule_blocks" ON doctor_schedule_blocks
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());
