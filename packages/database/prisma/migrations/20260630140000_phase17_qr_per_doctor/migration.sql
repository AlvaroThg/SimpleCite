-- Phase 17 — Modo de asignación de QR + QR por doctor.
-- qrAssignmentMode: SHARED (QR del tenant, default) | PER_DOCTOR (QR del doctor
-- asignado a la cita). Cuando es PER_DOCTOR el booking muestra DoctorProfile.qrUrl.
CREATE TYPE "QrAssignmentMode" AS ENUM ('SHARED', 'PER_DOCTOR');

ALTER TABLE "tenants"
  ADD COLUMN "qrAssignmentMode" "QrAssignmentMode" NOT NULL DEFAULT 'SHARED';

ALTER TABLE "doctor_profiles" ADD COLUMN "qrUrl" TEXT;
ALTER TABLE "doctor_profiles" ADD COLUMN "qrLabel" TEXT;
