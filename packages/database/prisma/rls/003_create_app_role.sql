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
-- 'postgres', RLS NO se aplica de forma predeterminada porque es un rol con
-- permisos elevados (superuser/bypassrls). Para forzar RLS incluso para
-- este rol, usamos FORCE ROW LEVEL SECURITY en 001_enable_rls.sql.
--
-- Alternativa recomendada para producción:
-- Crear un rol de aplicación con permisos limitados.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_backend') THEN
    -- Crear rol del backend (sin permisos de superusuario por defecto)
    CREATE ROLE app_backend WITH LOGIN PASSWORD 'CHANGE_THIS_SECURE_PASSWORD';
  END IF;
END
$$;

-- Otorgar permisos básicos en el schema public
GRANT USAGE ON SCHEMA public TO app_backend;

-- Otorgar permisos CRUD en todas las tablas
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_backend;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_backend;
