-- =====================================================================
-- Fase 13 — Color por servicio (para el calendario del panel)
-- =====================================================================
-- Aditivo. El color (#RRGGBB) pinta las citas no terminadas según su
-- servicio; null = azul de marca por defecto.
-- =====================================================================

ALTER TABLE "services" ADD COLUMN "color" TEXT;
