-- Phase 24 — Galería pública del tenant (fotos/videos del carrusel de la landing).
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

CREATE TABLE "tenant_media" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "type"      "MediaType" NOT NULL DEFAULT 'IMAGE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tenant_media_tenantId_idx" ON "tenant_media"("tenantId");

ALTER TABLE "tenant_media"
  ADD CONSTRAINT "tenant_media_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
