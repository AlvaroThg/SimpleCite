-- =====================================================================
-- Fase 5a — WhatsApp Instance Manager
-- =====================================================================
-- Cambios:
--  1. Enums: WaInstanceStatus, WaMessageStatus
--  2. Tabla whatsapp_instances  (una por tenant — contenedor Baileys)
--  3. Tabla whatsapp_messages   (mensajes con idempotencia por messageKey)
--  4. RLS en ambas tablas (aislamiento tenant estándar)
-- =====================================================================

-- ─── 1. Enums ────────────────────────────────────────────────────────

CREATE TYPE "WaInstanceStatus" AS ENUM (
  'CREATING', 'STARTING', 'PAIRING', 'CONNECTED', 'DISCONNECTED', 'ERROR', 'STOPPED'
);

CREATE TYPE "WaMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- ─── 2. whatsapp_instances ───────────────────────────────────────────

CREATE TABLE "whatsapp_instances" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "containerName" TEXT NOT NULL,
  "containerId"   TEXT,
  "internalPort"  INTEGER NOT NULL DEFAULT 4000,
  "status"        "WaInstanceStatus" NOT NULL DEFAULT 'CREATING',
  "phone"         TEXT,
  "lastSeen"      TIMESTAMP(3),
  "restartCount"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "whatsapp_instances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_instances_containerName_key" ON "whatsapp_instances"("containerName");
CREATE INDEX "whatsapp_instances_tenantId_idx"   ON "whatsapp_instances"("tenantId");
CREATE INDEX "whatsapp_instances_status_idx"     ON "whatsapp_instances"("status");

ALTER TABLE "whatsapp_instances"
  ADD CONSTRAINT "whatsapp_instances_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 3. whatsapp_messages ────────────────────────────────────────────

CREATE TABLE "whatsapp_messages" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "messageKey" TEXT NOT NULL,
  "phone"      TEXT NOT NULL,
  "text"       TEXT NOT NULL,
  "status"     "WaMessageStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "error"      TEXT,
  "sentAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_messages_messageKey_key" ON "whatsapp_messages"("messageKey");
CREATE INDEX "whatsapp_messages_tenantId_idx"         ON "whatsapp_messages"("tenantId");
CREATE INDEX "whatsapp_messages_instanceId_idx"       ON "whatsapp_messages"("instanceId");
CREATE INDEX "whatsapp_messages_status_attempts_idx"  ON "whatsapp_messages"("status", "attempts");

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "whatsapp_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 4. RLS ──────────────────────────────────────────────────────────

ALTER TABLE "whatsapp_instances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_instances" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_whatsapp_instances" ON "whatsapp_instances"
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "whatsapp_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_whatsapp_messages" ON "whatsapp_messages"
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());
