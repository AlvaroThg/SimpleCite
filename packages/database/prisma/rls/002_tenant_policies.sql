-- ============================================
-- SimpleCite — Políticas de Aislamiento por Tenant
-- Ejecutar en Supabase SQL Editor DESPUÉS de 001_enable_rls.sql
-- ============================================

-- ─── Función helper para extraer tenant_id del contexto ───
-- Soporta DOS modos:
--   1. Session variable 'app.current_tenant_id' (seteada por Prisma Extension desde NestJS)
--   2. JWT claim 'tenant_id' (para acceso directo desde Supabase client / frontend)
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid AS $$
BEGIN
  -- Primero intenta leer de la variable de sesión (backend NestJS)
  IF current_setting('app.current_tenant_id', true) IS NOT NULL
     AND current_setting('app.current_tenant_id', true) != '' THEN
    RETURN current_setting('app.current_tenant_id', true)::uuid;
  END IF;

  -- Fallback: leer del JWT claim (acceso directo Supabase)
  IF auth.jwt() IS NOT NULL AND (auth.jwt() ->> 'tenant_id') IS NOT NULL THEN
    RETURN (auth.jwt() ->> 'tenant_id')::uuid;
  END IF;

  -- Si ninguno está disponible, retorna NULL (RLS bloqueará todo)
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ─── Política: tenants ───
-- Un tenant solo puede ver su propio registro
CREATE POLICY "tenant_isolation_tenants" ON tenants
  FOR ALL
  USING (id = public.current_tenant_id())
  WITH CHECK (id = public.current_tenant_id());

-- ─── Política: users ───
CREATE POLICY "tenant_isolation_users" ON users
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── Política: patients ───
CREATE POLICY "tenant_isolation_patients" ON patients
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── Política: services ───
CREATE POLICY "tenant_isolation_services" ON services
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── Política: appointments ───
CREATE POLICY "tenant_isolation_appointments" ON appointments
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── Política: medical_notes ───
CREATE POLICY "tenant_isolation_medical_notes" ON medical_notes
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
