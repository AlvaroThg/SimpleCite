-- Phase 16 — Segundo QR estático de pago + etiquetas de banco.
-- El tenant puede cargar 2 QR bancarios; el booking muestra uno y permite ver
-- el otro como respaldo. Las labels son el nombre del banco de cada QR.
ALTER TABLE "tenants" ADD COLUMN "staticQrLabel" TEXT;
ALTER TABLE "tenants" ADD COLUMN "staticQrUrl2" TEXT;
ALTER TABLE "tenants" ADD COLUMN "staticQrLabel2" TEXT;
