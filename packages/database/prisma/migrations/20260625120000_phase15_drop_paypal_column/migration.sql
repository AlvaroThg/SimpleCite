-- Phase 15 — Quitar la integración con PayPal.
-- La suscripción del SaaS se gestiona manualmente en DB (subscriptionStatus /
-- subscriptionEndDate siguen existiendo y el SubscriptionGuard los valida).
-- Al hacer DROP COLUMN, Postgres elimina también el índice unique asociado.
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "paypalSubscriptionId";
