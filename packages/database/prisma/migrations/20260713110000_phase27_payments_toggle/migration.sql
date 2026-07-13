-- Phase 27 — Módulo de pagos activable por clínica.
-- Con paymentsEnabled = false el booking público (web y bot) no pide método
-- de pago ni muestra QR: avisa que se paga en la clínica antes de la sesión.
-- Solo el ADMIN del tenant puede cambiarlo (switch en Configuración).

ALTER TABLE "tenants" ADD COLUMN "paymentsEnabled" BOOLEAN NOT NULL DEFAULT true;
