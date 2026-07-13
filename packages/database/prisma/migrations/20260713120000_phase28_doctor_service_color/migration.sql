-- Phase 28 — Color personal del doctor por servicio (su vista de calendario).
-- No pisa Service.color (el color global que administra el admin).

ALTER TABLE "doctor_services" ADD COLUMN "color" TEXT;
