-- =====================================================================
-- Fase 8 — Pagos híbridos (QR estático + efectivo) y onboarding CLI
-- =====================================================================
-- Se descarta la pasarela dinámica / STUB de QR Simple para el MVP:
-- el cobro es manual asistido por WhatsApp (QR bancario estático + comprobante)
-- o efectivo en la clínica. Los modelos PaymentIntent/PaymentEvent se
-- preservan como legacy (no se tocan aquí).
--
-- Cambios (todos ADITIVOS e IDEMPOTENTES):
--   1. Enum PaymentMethod (CASH | STATIC_QR)
--   2. appointments.paymentMethod (NOT NULL DEFAULT 'CASH') + appointments.receiptUrl
--   3. tenants.staticQrUrl (QR bancario estático de la clínica)
--   4. users.phone (teléfono del admin capturado en el onboarding CLI)
--   5. Nuevo valor AWAITING_PAYMENT_METHOD en el enum WaConversationState
--
-- Idempotente (IF NOT EXISTS / guards) por si el schema ya fue aplicado
-- vía `prisma db push` en algún entorno de desarrollo. Las columnas nuevas
-- quedan cubiertas por las políticas RLS existentes a nivel de tabla.
-- =====================================================================

-- 1. Enum PaymentMethod -------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethod') THEN
    CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'STATIC_QR');
  END IF;
END
$$;

-- 2. appointments: método de pago + comprobante ------------------------
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT;

-- 3. tenants: QR bancario estático -------------------------------------
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "staticQrUrl" TEXT;

-- 4. users: teléfono del admin (onboarding) ----------------------------
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- 5. Nuevo estado conversacional del bot -------------------------------
-- PG12+ permite ADD VALUE dentro de una transacción siempre que el valor
-- nuevo no se use en la misma transacción (no lo usamos aquí).
ALTER TYPE "WaConversationState" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT_METHOD';
