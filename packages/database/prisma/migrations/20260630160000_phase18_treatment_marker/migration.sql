-- Phase 18 — Marcador de tratamiento en la historia clínica.
-- treatmentLabel: etiqueta libre (ej. "Fisioterapia rodilla — sesión 1").
-- isNewTreatment: marca la consulta como inicio de un nuevo tratamiento.
ALTER TABLE "medical_records" ADD COLUMN "treatmentLabel" TEXT;
ALTER TABLE "medical_records" ADD COLUMN "isNewTreatment" BOOLEAN NOT NULL DEFAULT false;
