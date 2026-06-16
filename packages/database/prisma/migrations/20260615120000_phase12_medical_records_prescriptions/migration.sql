-- =====================================================================
-- Fase 12 — Core médico: cancelación por magic link + historia clínica
--           estructurada + recetas digitales
-- =====================================================================
-- Cambios:
--  1. appointments: + cancellationToken (único) para cancelación self-service
--  2. medical_records: historia clínica 1-1 con la cita (dato sensible EHR)
--  3. prescriptions: recetas digitales (medications JSONB) → PDF
--  4. RLS dormante para las dos tablas nuevas (mismo patrón que medical_notes)
-- =====================================================================

-- ─── 1. appointments: token de cancelación ──────────────────────────
ALTER TABLE "appointments" ADD COLUMN "cancellationToken" TEXT;
CREATE UNIQUE INDEX "appointments_cancellationToken_key"
  ON "appointments"("cancellationToken");

-- ─── 2. medical_records ─────────────────────────────────────────────
CREATE TABLE "medical_records" (
  "id"            TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "patientId"     TEXT NOT NULL,
  "doctorId"      TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "symptoms"      TEXT,
  "diagnosis"     TEXT,
  "treatment"     TEXT,
  "privateNotes"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "medical_records_appointmentId_key" ON "medical_records"("appointmentId");
CREATE INDEX "medical_records_tenantId_idx" ON "medical_records"("tenantId");
CREATE INDEX "medical_records_tenantId_patientId_idx" ON "medical_records"("tenantId", "patientId");
CREATE INDEX "medical_records_tenantId_doctorId_idx" ON "medical_records"("tenantId", "doctorId");

ALTER TABLE "medical_records"
  ADD CONSTRAINT "medical_records_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "medical_records"
  ADD CONSTRAINT "medical_records_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "medical_records"
  ADD CONSTRAINT "medical_records_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "medical_records"
  ADD CONSTRAINT "medical_records_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 3. prescriptions ───────────────────────────────────────────────
CREATE TABLE "prescriptions" (
  "id"              TEXT NOT NULL,
  "medicalRecordId" TEXT NOT NULL,
  "patientId"       TEXT NOT NULL,
  "doctorId"        TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "medications"     JSONB NOT NULL,
  "instructions"    TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "prescriptions_tenantId_idx" ON "prescriptions"("tenantId");
CREATE INDEX "prescriptions_tenantId_patientId_idx" ON "prescriptions"("tenantId", "patientId");
CREATE INDEX "prescriptions_medicalRecordId_idx" ON "prescriptions"("medicalRecordId");

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_medicalRecordId_fkey"
  FOREIGN KEY ("medicalRecordId") REFERENCES "medical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 4. RLS dormante (mismo patrón EHR que medical_notes) ───────────
-- El rol postgres bypasa RLS hoy; el aislamiento real es app-layer
-- (where:{tenantId} + control por rol en el servicio). Se deja lista
-- para activar con un rol sin bypassrls (RLS_ENFORCED=true).
ALTER TABLE "medical_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescriptions"   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ehr_read_medical_records" ON "medical_records"
  FOR SELECT
  USING (
    "tenantId" = public.current_tenant_id()
    AND (
      public.current_user_role() = 'ADMIN'
      OR "doctorId" = public.current_user_id()
    )
  );
CREATE POLICY "ehr_write_medical_records" ON "medical_records"
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK (
    "tenantId" = public.current_tenant_id()
    AND "doctorId" = public.current_user_id()
  );

CREATE POLICY "ehr_read_prescriptions" ON "prescriptions"
  FOR SELECT
  USING (
    "tenantId" = public.current_tenant_id()
    AND (
      public.current_user_role() = 'ADMIN'
      OR "doctorId" = public.current_user_id()
    )
  );
CREATE POLICY "ehr_write_prescriptions" ON "prescriptions"
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK (
    "tenantId" = public.current_tenant_id()
    AND "doctorId" = public.current_user_id()
  );
