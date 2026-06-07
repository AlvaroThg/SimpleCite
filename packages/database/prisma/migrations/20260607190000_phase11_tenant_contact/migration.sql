-- =====================================================================
-- Fase 11 — Contacto y redes del tenant (footer de la landing)
-- =====================================================================
-- Aditivo e idempotente.
-- =====================================================================

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "facebookUrl" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "instagramUrl" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "whatsappContact" TEXT;
