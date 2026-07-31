-- Phase 31 — Identidad del paciente: teléfono O CI.
--
-- Hasta ahora el teléfono era obligatorio, lo que impedía registrar pacientes
-- mayores que llegan sin celular propio (la recepción los identifica por
-- cédula). Se exige al menos uno de los dos a nivel de aplicación; en la BD
-- ambos quedan opcionales.
--
-- El índice único (phone, tenantId) sigue vigente: en Postgres los NULL son
-- distintos entre sí, así que varios pacientes sin teléfono conviven en la
-- misma clínica sin chocar.

ALTER TABLE "patients" ALTER COLUMN "phone" DROP NOT NULL;
