-- Phase 30 — Bot de WhatsApp habilitado por clinica (add-on de plataforma).
-- El bot centralizado solo resuelve/atiende clinicas con botEnabled=true.
-- Lo controla la plataforma (CLI/DB), no el admin del tenant. Default false:
-- ninguna clinica existente queda expuesta al bot al desplegar.

ALTER TABLE "tenants" ADD COLUMN "botEnabled" BOOLEAN NOT NULL DEFAULT false;
