-- Phase 29 — Sesion extendida del panel por clinica (a pedido del cliente).
-- extendedSession: 30 dias en vez de 12h. adminOnly: acota esa sesion larga
-- solo al admin (los especialistas expiran normal). Solo ADMIN los cambia.

ALTER TABLE "tenants" ADD COLUMN "extendedSession" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "extendedSessionAdminOnly" BOOLEAN NOT NULL DEFAULT false;
