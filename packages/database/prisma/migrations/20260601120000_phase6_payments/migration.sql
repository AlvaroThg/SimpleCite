-- =====================================================================
-- Fase 6 — Modelo de pagos (payment intents + webhook events)
-- =====================================================================
-- Cambios:
--  1. Enum PaymentStatus
--  2. Tabla payment_intents (1:N con appointments — reintentos + historial)
--  3. Tabla payment_events  (webhook raw, dedup por eventId)
--  4. RLS en ambas tablas
-- =====================================================================

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- ─── payment_intents ─────────────────────────────────────────────────

CREATE TABLE "payment_intents" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "appointmentId"     TEXT NOT NULL,
  "amount"            DECIMAL(10,2) NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'BOB',
  "status"            "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "providerPaymentId" TEXT,
  "qrPayload"         TEXT,
  "expiresAt"         TIMESTAMP(3) NOT NULL,
  "paidAt"            TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_intents_providerPaymentId_key" ON "payment_intents"("providerPaymentId");
CREATE INDEX "payment_intents_tenantId_idx"            ON "payment_intents"("tenantId");
CREATE INDEX "payment_intents_appointmentId_idx"       ON "payment_intents"("appointmentId");
CREATE INDEX "payment_intents_status_expiresAt_idx"    ON "payment_intents"("status", "expiresAt");
CREATE INDEX "payment_intents_providerPaymentId_idx"   ON "payment_intents"("providerPaymentId");

ALTER TABLE "payment_intents"
  ADD CONSTRAINT "payment_intents_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── payment_events ──────────────────────────────────────────────────

CREATE TABLE "payment_events" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT,
  "paymentIntentId" TEXT,
  "eventId"         TEXT NOT NULL,
  "eventType"       TEXT NOT NULL,
  "rawPayload"      JSONB NOT NULL,
  "processedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_events_eventId_key"        ON "payment_events"("eventId");
CREATE INDEX "payment_events_paymentIntentId_idx"       ON "payment_events"("paymentIntentId");

ALTER TABLE "payment_events"
  ADD CONSTRAINT "payment_events_paymentIntentId_fkey"
  FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── RLS ─────────────────────────────────────────────────────────────
-- El webhook (sistema, sin contexto tenant) escribe vía el rol de la app.
-- Los lectores tenant-scoped (paciente/admin) ven solo sus filas.

ALTER TABLE "payment_intents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_intents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_payment_intents" ON "payment_intents"
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_events" FORCE ROW LEVEL SECURITY;
-- payment_events.tenantId puede ser NULL (webhook sin asociar). La política
-- permite filas del tenant actual; las NULL solo son visibles por acceso directo.
CREATE POLICY "tenant_isolation_payment_events" ON "payment_events"
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" IS NULL OR "tenantId" = public.current_tenant_id());
