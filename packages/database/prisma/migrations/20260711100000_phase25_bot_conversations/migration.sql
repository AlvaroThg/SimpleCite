-- Phase 25 — Conversaciones del bot de reservas (Telegram / WhatsApp Cloud).
-- Una fila por chat (channel + chatId): clínica activa, paso del wizard y
-- estado acumulado en JSONB. Sin FK a patients: la identidad es el canal.

CREATE TABLE "bot_conversations" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'IDLE',
    "tenantId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_conversations_channel_chatId_key"
    ON "bot_conversations"("channel", "chatId");

ALTER TABLE "bot_conversations"
    ADD CONSTRAINT "bot_conversations_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
