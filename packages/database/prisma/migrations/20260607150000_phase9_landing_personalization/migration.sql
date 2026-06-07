-- =====================================================================
-- Fase 9 — Personalización de la landing del tenant
-- =====================================================================
-- Aditivo e idempotente. Campos opcionales para que el admin personalice
-- la página pública: paleta (secondaryColor), imagen de hero, textos por
-- sección, y un ícono por servicio.
-- =====================================================================

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "secondaryColor" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "heroImageUrl" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "heroTitle" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "heroSubtitle" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "servicesTitle" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "specialistsTitle" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "ctaTitle" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "ctaSubtitle" TEXT;

ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "icon" TEXT;
