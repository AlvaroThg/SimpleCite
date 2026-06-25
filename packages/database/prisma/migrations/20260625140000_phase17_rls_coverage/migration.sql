-- Phase 17 — Cobertura RLS para tablas tenant-scoped que faltaban.
--
-- Habilita Row Level Security + política de aislamiento por tenant en las
-- tablas que se acceden SIEMPRE dentro del contexto de request (donde el
-- TenantContextInterceptor abre la transacción con set_config). Usa el helper
-- public.current_tenant_id() creado en prisma/rls/002_tenant_policies.sql.
--
-- Quedan FUERA a propósito (se acceden desde webhooks SIN contexto de tenant —
-- set_config vacío bloquearía la política): payment_intents, payment_events,
-- whatsapp_instances, whatsapp_messages, wa_conversations. Esas siguen aisladas
-- por el filtro app-layer where:{tenantId} hasta refactorizar sus handlers.
--
-- RLS permanece DORMANTE hasta RLS_ENFORCED=true + un rol Postgres sin
-- bypassrls (ver docs/rls-enforcement.md).

-- ─── Habilitar + forzar RLS ───
ALTER TABLE doctor_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_services FORCE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedule_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedule_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedule_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE patient_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_otps FORCE ROW LEVEL SECURITY;

-- ─── Políticas de aislamiento por tenant ───
CREATE POLICY "tenant_isolation_doctor_services" ON doctor_services
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

CREATE POLICY "tenant_isolation_doctor_schedule_rules" ON doctor_schedule_rules
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

CREATE POLICY "tenant_isolation_doctor_schedule_blocks" ON doctor_schedule_blocks
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());

CREATE POLICY "tenant_isolation_patient_otps" ON patient_otps
  FOR ALL
  USING ("tenantId" = public.current_tenant_id())
  WITH CHECK ("tenantId" = public.current_tenant_id());
