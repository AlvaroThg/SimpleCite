-- =====================================================================
-- Bootstrap de funciones RLS helper — EJECUTAR ANTES DE `migrate deploy`
-- =====================================================================
-- Las políticas RLS (desde la migración phase3) referencian
-- `public.current_tenant_id()`, pero esa función NO se crea en ninguna
-- migración (en la DB original se creó manualmente). Sin estas funciones, una
-- base de datos NUEVA falla al aplicar las migraciones.
--
-- Idempotente (CREATE OR REPLACE). Seguro de re-ejecutar en cualquier DB.
--
-- Uso en una DB fresca (ej. el nuevo proyecto en sa-east-1):
--   psql "<DIRECT_URL>" -f packages/database/scripts/bootstrap-rls-functions.sql
--   pnpm db:migrate:deploy
--   pnpm db:seed
--
-- Devuelven el valor de la variable de sesión (vacío si no está fijada), que es
-- lo que `runWithTenantContext` setea con set_config(..., true).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.current_tenant_id', true) $$;

CREATE OR REPLACE FUNCTION public.current_user_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.current_user_id', true) $$;

CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.current_user_role', true) $$;
