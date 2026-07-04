-- Phase 23 — Link de Google Maps del tenant (aditiva).
-- Si es null, los botones de mapa generan una búsqueda desde `address`.
ALTER TABLE "tenants" ADD COLUMN "mapsUrl" TEXT;
