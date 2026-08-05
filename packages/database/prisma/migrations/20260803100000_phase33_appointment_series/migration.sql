-- Phase 33 — Citas recurrentes como tratamiento ("Sesión 3 de 10").
--
-- Las citas creadas juntas comparten un seriesId. Sin tabla propia: el total de
-- la serie sale de contar sus citas, y cada una se edita, mueve o cancela por
-- separado (el dinero es por cita, así que la edición masiva se evita en v1).
--
-- Aditiva y segura: las citas existentes quedan con seriesId NULL = cita suelta.

ALTER TABLE "appointments" ADD COLUMN "seriesId" TEXT;

-- Listar/contar las citas de una serie dentro del tenant.
CREATE INDEX "appointments_tenantId_seriesId_idx"
  ON "appointments"("tenantId", "seriesId")
  WHERE "seriesId" IS NOT NULL;
