-- Phase 21 — Ubicación de la clínica + stub de notificación de reservas (Addendum H).
-- Aditiva: columna nullable + tabla nueva sin impacto en el flujo existente.

ALTER TABLE "tenants" ADD COLUMN "locationPhotoUrl" TEXT;

CREATE TABLE "booking_notifications" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_notifications_appointmentId_key" ON "booking_notifications"("appointmentId");
CREATE INDEX "booking_notifications_tenantId_idx" ON "booking_notifications"("tenantId");
