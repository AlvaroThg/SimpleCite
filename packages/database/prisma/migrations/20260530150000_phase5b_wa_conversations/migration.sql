-- =====================================================================
-- Fase 5b — Bot conversacional WhatsApp
-- =====================================================================
-- Cambios:
--  1. Enum WaConversationState
--  2. Tabla wa_conversations (estado conversacional por paciente)
--  3. RLS en wa_conversations
-- =====================================================================

CREATE TYPE "WaConversationState" AS ENUM (
  'IDLE', 'AWAITING_DOCTOR', 'AWAITING_SERVICE', 'AWAITING_DATE',
  'AWAITING_SLOT', 'AWAITING_NAME', 'AWAITING_OTP', 'COMPLETED'
);

CREATE TABLE "wa_conversations" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "instanceId"    TEXT NOT NULL,
  "phone"         TEXT NOT NULL,
  "state"         "WaConversationState" NOT NULL DEFAULT 'IDLE',
  "context"       JSONB NOT NULL DEFAULT '{}',
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "wa_conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wa_conversations_tenantId_phone_key" ON "wa_conversations"("tenantId", "phone");
CREATE INDEX "wa_conversations_tenantId_idx"  ON "wa_conversations"("tenantId");
CREATE INDEX "wa_conversations_expiresAt_idx" ON "wa_conversations"("expiresAt");

ALTER TABLE "wa_conversations"
  ADD CONSTRAINT "wa_conversations_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "whatsapp_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wa_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wa_conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_wa_conversations" ON "wa_conversations"
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());
