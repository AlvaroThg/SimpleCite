-- =====================================================================
-- Fase 4 — API pública, OTP de pacientes, estado TENTATIVE
-- =====================================================================
-- Cambios:
--  1. Añade valor TENTATIVE al enum AppointmentStatus (vía rename-trick,
--     porque ALTER TYPE ADD VALUE no funciona dentro de una transacción).
--  2. Re-crea exclusion constraint anti-overlap incluyendo TENTATIVE
--     (un slot reservado durante OTP también bloquea a otros pacientes).
--  3. Añade columna `expiresAt` a appointments para TTL de TENTATIVE.
--  4. Crea tabla `patient_otps` con RLS habilitado.
-- =====================================================================

-- ─── 1. Reemplazar enum AppointmentStatus añadiendo TENTATIVE ────────
-- Workaround para que se aplique en una transacción única.
CREATE TYPE "AppointmentStatus_new" AS ENUM (
  'TENTATIVE', 'PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'
);

-- Drop temporal del exclusion constraint (depende del enum)
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_no_overlap_per_doctor";

-- Cambiar columna al nuevo tipo (default se preserva tras re-asignar)
ALTER TABLE "appointments"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "AppointmentStatus_new" USING ("status"::text::"AppointmentStatus_new"),
  ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';

-- Reemplazar enum viejo
DROP TYPE "AppointmentStatus";
ALTER TYPE "AppointmentStatus_new" RENAME TO "AppointmentStatus";

-- ─── 2. Re-crear exclusion constraint con TENTATIVE incluido ─────────
-- TENTATIVE también debe bloquear el slot — sino dos pacientes podrían
-- arrancar el flujo OTP sobre la misma franja en simultáneo.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap_per_doctor"
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "doctorId" WITH =,
    tsrange("startTime", "endTime", '[)') WITH &&
  )
  WHERE (status IN ('TENTATIVE', 'PENDING_PAYMENT', 'CONFIRMED'));

-- ─── 3. Columna expiresAt en appointments ────────────────────────────
ALTER TABLE "appointments" ADD COLUMN "expiresAt" TIMESTAMP(3);
-- Índice parcial: solo TENTATIVE tienen expiresAt; barre rápido en cleanup.
CREATE INDEX "appointments_expiresAt_idx" ON "appointments"("expiresAt") WHERE "expiresAt" IS NOT NULL;

-- ─── 4. Tabla patient_otps ───────────────────────────────────────────
CREATE TABLE "patient_otps" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "phone"      TEXT NOT NULL,
  "codeHash"   TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "patient_otps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "patient_otps_tenantId_phone_createdAt_idx"
  ON "patient_otps"("tenantId", "phone", "createdAt");
CREATE INDEX "patient_otps_expiresAt_idx" ON "patient_otps"("expiresAt");

-- ─── RLS para patient_otps ───────────────────────────────────────────
ALTER TABLE "patient_otps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_otps" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_patient_otps" ON "patient_otps"
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());
