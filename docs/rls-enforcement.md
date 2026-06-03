# Activación de RLS real (enforcement a nivel DB)

## Estado actual (listo, NO activado)

Hoy la app se conecta a Supabase como el rol `postgres`, que tiene
`rolbypassrls = true`. Por eso **las políticas RLS no se ejecutan**: el
aislamiento multi-tenant se garantiza en la capa de aplicación (cada query
incluye `where: { tenantId }`, con el `tenantId` tomado del JWT o del slug del
path). Ver `memory/rls-bypassed-postgres-role.md`.

Todo lo necesario para activar RLS real ya está preparado:

- ✅ El interceptor puebla `app.current_tenant_id`, `app.current_user_id` y
  `app.current_user_role` por transacción (`runWithTenantContext`).
- ✅ Políticas RLS en todas las tablas, incluyendo control por rol del EHR
  (`ehr_read_medical_notes` / `ehr_write_medical_notes`) y las de
  `doctor_profiles` / `staff_profiles`.
- ✅ Viabilidad verificada: un rol sin bypassrls conecta por el pooler de
  Supabase (`<rol>.<project_ref>`) y RLS se aplica (un `SELECT` sin contexto
  devuelve 0 filas).

## Por qué no está activado

Activarlo requiere que **todas** las queries que corren fuera del contexto de
tenant usen una conexión privilegiada (bypass), o fallarían (deny-all). Esas
son rutas auth-críticas y de sistema:

| Ruta / servicio                                          | Por qué corre sin contexto                        |
| -------------------------------------------------------- | ------------------------------------------------- |
| `TenantMiddleware`                                       | resuelve el tenant por slug (aún no hay contexto) |
| `TenantGuard`, `JwtStrategy`                             | validan en fase de guard (antes del interceptor)  |
| `PaymentsWebhookService`, `PaymentReconciliationService` | cross-tenant (sistema)                            |
| `WhatsApp`: instance-manager, wa-bot, wa-message, health | webhook/cron cross-tenant                         |

## Pasos para activar (cuando se decida)

1. **Crear el rol** sin bypassrls (idempotente):

   ```bash
   psql "<DIRECT_URL>" -v pw="'<PASSWORD_FUERTE>'" \
     -f packages/database/scripts/setup-rls-role.sql
   ```

2. **Dual-client en NestJS**:
   - `PrismaService` (actual) → conecta con `DATABASE_URL` apuntando al rol
     `simplecite_app` (enforced). Lo usan los servicios tenant-scoped vía
     `prisma.client.*`.
   - Nuevo `PrismaSystemService` → conecta con `SYSTEM_DATABASE_URL` apuntando
     a `postgres` (bypass). Inyectarlo en: middleware, TenantGuard, JwtStrategy,
     webhooks de pagos/WhatsApp, crons (reconciliation, wa-health) y todo el
     módulo WhatsApp (instance-manager, wa-bot, wa-message).

3. **Env**:

   ```
   DATABASE_URL="postgresql://simplecite_app.<ref>:<pw>@<host>:6543/postgres?pgbouncer=true"
   SYSTEM_DATABASE_URL="postgresql://postgres.<ref>:<pw>@<host>:6543/postgres?pgbouncer=true"
   DIRECT_URL  # se mantiene como postgres para migraciones
   ```

4. **Regresión E2E obligatoria** antes de dar por bueno el flip:
   login staff, resolución de tenant, booking público, OTP, pago + webhook,
   panel (citas/pacientes/notas), y **tests cross-tenant** (un tenant no ve
   datos de otro) y **cross-role** (staff no ve notas clínicas).

5. **Rollback**: revertir `DATABASE_URL` al rol `postgres`. Es un cambio de
   env, sin migración — reversible al instante.

## Seguridad del rol de prueba

Durante la verificación de viabilidad se creó `simplecite_app` con un password
aleatorio temporal. **Rotarlo** con el script de arriba antes de usarlo en
producción.
