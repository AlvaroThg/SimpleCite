-- Phase 26 — Resolución del dinero en citas pagadas que se cancelan.
-- El QR bancario es una transferencia directa que el sistema no puede
-- revertir: cuando una cita PAGADA se cancela queda PENDING hasta que el
-- staff registre qué hizo con el dinero (devolución manual o saldo a favor).

CREATE TYPE "RefundResolution" AS ENUM ('PENDING', 'REFUNDED', 'CREDITED');

ALTER TABLE "appointments" ADD COLUMN "refundResolution" "RefundResolution";

-- Backfill: citas ya canceladas con pago registrado quedan pendientes de
-- resolución para que el reporte las muestre desde el primer día.
UPDATE "appointments"
SET "refundResolution" = 'PENDING'
WHERE "status" = 'CANCELLED'
  AND ("isPaid" = true OR "receiptUrl" IS NOT NULL)
  AND "paymentMethod" <> 'INSURANCE';
