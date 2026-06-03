-- =====================================================================
-- Fix seguridad: rate limiting de OTP backed por DB
-- =====================================================================
-- Añade requestIp a patient_otps para limitar OTPs por IP (además de por
-- phone), de forma persistente y multi-instancia (reemplaza el throttler
-- en memoria que el guard global eclipsaba).
-- =====================================================================

ALTER TABLE "patient_otps" ADD COLUMN "requestIp" TEXT;

CREATE INDEX "patient_otps_requestIp_createdAt_idx" ON "patient_otps"("requestIp", "createdAt");
