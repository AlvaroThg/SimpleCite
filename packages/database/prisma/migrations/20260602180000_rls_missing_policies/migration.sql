-- =====================================================================
-- RLS hardening: políticas faltantes en doctor_profiles y staff_profiles
-- =====================================================================
-- Ambas tablas tenían RLS habilitado pero SIN política → con un rol sin
-- bypassrls eso es "deny all". Añadimos la política tenant_isolation estándar
-- para que el enforcement real (cuando se active el rol simplecite_app) no
-- rompa la lectura/escritura de perfiles.
--
-- Seguro de aplicar ahora: el rol postgres bypasea RLS, así que esto no
-- cambia el comportamiento del sistema vivo — solo prepara el terreno.
-- =====================================================================

ALTER TABLE "doctor_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doctor_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_doctor_profiles" ON "doctor_profiles";
CREATE POLICY "tenant_isolation_doctor_profiles" ON "doctor_profiles"
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

ALTER TABLE "staff_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_staff_profiles" ON "staff_profiles";
CREATE POLICY "tenant_isolation_staff_profiles" ON "staff_profiles"
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());
