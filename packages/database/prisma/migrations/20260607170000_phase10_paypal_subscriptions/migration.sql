-- =====================================================================
-- Fase 10 — Suscripciones con PayPal (Sandbox)
-- =====================================================================
-- Control de acceso por suscripción en el Tenant. Aditivo e idempotente.
-- subscriptionStatus: TRIAL | ACTIVE | PAST_DUE | CANCELED
-- =====================================================================

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "paypalSubscriptionId" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIAL';
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "subscriptionEndDate" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_paypalSubscriptionId_key"
  ON "tenants"("paypalSubscriptionId");
