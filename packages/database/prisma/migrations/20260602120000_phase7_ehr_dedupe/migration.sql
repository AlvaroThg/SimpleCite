-- =====================================================================
-- Fase 7 — EHR (notas clínicas) + dedupe de pacientes + índices
-- =====================================================================
-- Cambios:
--  1. Enum NoteVisibility
--  2. medical_notes: + appointmentId, + visibility, + índice cronológico
--  3. patients: índice parcial único por (tenantId, ci) + índice de lookup
--  4. Endurecer RLS de medical_notes (dormante — el rol postgres bypasa RLS,
--     pero se deja lista para activar con un rol sin bypassrls)
-- =====================================================================

CREATE TYPE "NoteVisibility" AS ENUM ('PRIVATE');

-- ─── medical_notes: nuevas columnas ──────────────────────────────────
ALTER TABLE "medical_notes" ADD COLUMN "appointmentId" TEXT;
ALTER TABLE "medical_notes" ADD COLUMN "visibility" "NoteVisibility" NOT NULL DEFAULT 'PRIVATE';

ALTER TABLE "medical_notes"
  ADD CONSTRAINT "medical_notes_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "medical_notes_tenantId_patientId_createdAt_idx"
  ON "medical_notes"("tenantId", "patientId", "createdAt");
CREATE INDEX "medical_notes_appointmentId_idx" ON "medical_notes"("appointmentId");

-- ─── patients: dedupe por CI ─────────────────────────────────────────
-- Índice parcial único: dos pacientes del mismo tenant no comparten CI,
-- pero se permite CI NULL en múltiples filas.
CREATE UNIQUE INDEX "patients_ci_tenantId_key"
  ON "patients"("ci", "tenantId") WHERE "ci" IS NOT NULL;
CREATE INDEX "patients_tenantId_ci_idx" ON "patients"("tenantId", "ci");

-- ─── RLS endurecido para medical_notes (dormante) ───────────────────
-- Helpers de contexto de usuario (espejo de current_tenant_id()).
CREATE OR REPLACE FUNCTION public.current_user_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.current_user_id', true) $$;
CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.current_user_role', true) $$;

-- Reemplazar la política tenant-only por una con control de rol.
DROP POLICY IF EXISTS "tenant_isolation_medical_notes" ON "medical_notes";

CREATE POLICY "ehr_read_medical_notes" ON "medical_notes"
  FOR SELECT
  USING (
    "tenantId" = public.current_tenant_id()
    AND (
      public.current_user_role() = 'ADMIN'
      OR "doctorId" = public.current_user_id()
      OR EXISTS (
        SELECT 1 FROM "appointments" a
        WHERE a."patientId" = "medical_notes"."patientId"
          AND a."doctorId" = public.current_user_id()
          AND a."tenantId" = "medical_notes"."tenantId"
      )
    )
  );

-- Escritura: author dentro del tenant (admin o doctor). Staff no escribe.
CREATE POLICY "ehr_write_medical_notes" ON "medical_notes"
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK (
    "tenantId" = public.current_tenant_id()
    AND "doctorId" = public.current_user_id()
  );
