-- Phase 19 — Snapshot del monto cobrado por cita.
-- Congela customPrice del doctor ?? precio del servicio al crear la cita, para
-- que los reportes de ingresos sean exactos aunque el precio del servicio cambie.
ALTER TABLE "appointments" ADD COLUMN "price" DECIMAL(10,2);
