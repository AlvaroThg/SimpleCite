-- ============================================
-- SimpleCite — Rol de Aplicación para RLS
-- Ejecutar en Supabase SQL Editor DESPUÉS de 002_tenant_policies.sql
-- ============================================

-- Nota: En Supabase, los roles 'anon' y 'authenticated' ya existen.
-- Las políticas RLS aplican automáticamente a estos roles.
-- 
-- Para el backend NestJS, conectamos con el usuario de Supabase (postgres)
-- y usamos set_config('app.current_tenant_id', ...) en cada transacción
-- para que las políticas RLS filtren los datos correctamente.
--
-- ⚠️ IMPORTANTE: Si usas el connection string de Supabase con el usuario
-- 'postgres', RLS NO se aplica porque es superuser. Para forzar RLS
-- incluso para superusers, usamos FORCE ROW LEVEL SECURITY en 001_enable_rls.sql.
--
-- Alternativa recomendada para producción:
-- Crear un rol de aplicación con permisos limitados:

-- CREATE ROLE app_backend NOLOGIN;
-- GRANT USAGE ON SCHEMA public TO app_backend;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_backend;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_backend;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_backend;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_backend;

-- Para usar este rol desde el connection string de Supabase:
-- SET ROLE app_backend;  (ejecutado antes de cada query)
