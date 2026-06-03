-- =====================================================================
-- Setup del rol de aplicación SIN bypassrls (enforcement real de RLS)
-- =====================================================================
-- Idempotente. Ejecutar como `postgres` (DIRECT_URL) UNA vez antes de
-- activar el enforcement. NO se aplica en migraciones porque maneja un
-- secreto (password) que NO debe vivir en git.
--
-- Uso:
--   psql "<DIRECT_URL>" -v pw="'UN_PASSWORD_FUERTE'" -f setup-rls-role.sql
-- o reemplaza :pw manualmente.
-- =====================================================================

-- 1. Crear el rol (sin bypassrls, con login).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'simplecite_app') THEN
    CREATE ROLE simplecite_app LOGIN NOBYPASSRLS;
  END IF;
END $$;

-- 2. Password (pásalo con -v pw="'...'"; rota el de pruebas).
ALTER ROLE simplecite_app PASSWORD :pw;

-- 3. Privilegios sobre el esquema actual.
GRANT USAGE ON SCHEMA public TO simplecite_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO simplecite_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO simplecite_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO simplecite_app;

-- 4. Privilegios por defecto para tablas/secuencias futuras (creadas por postgres).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO simplecite_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO simplecite_app;

-- Nota: simplecite_app NO es dueño de las tablas, así que FORCE ROW LEVEL
-- SECURITY + las políticas tenant_isolation/ehr aplican plenamente sobre él.
