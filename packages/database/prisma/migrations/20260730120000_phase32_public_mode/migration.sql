-- Phase 32 — Modo de la página pública por clínica (rasgo del plan).
--
-- BOOKING  → reserva web completa (comportamiento actual; default para no
--            cambiarle nada a las clínicas ya existentes).
-- WHATSAPP → sin reserva web: el CTA abre el chat de la clínica (plan Básico).
-- LANDING  → página solo informativa; agenda únicamente el staff en el panel.

CREATE TYPE "PublicMode" AS ENUM ('BOOKING', 'WHATSAPP', 'LANDING');

ALTER TABLE "tenants"
  ADD COLUMN "publicMode" "PublicMode" NOT NULL DEFAULT 'BOOKING';
