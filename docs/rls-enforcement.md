# RLS enforcement (aislamiento por tenant a nivel de Postgres)

SimpleCite aísla los datos de cada clínica de dos formas:

1. **App-layer (siempre activo):** cada query lleva `where: { tenantId }`. Es lo
   que protege hoy en producción.
2. **RLS real (opt-in):** políticas `Row Level Security` en Postgres que filtran
   por `app.current_tenant_id`. Están **dormidas** por defecto porque el rol con
   el que se conecta la app (p.ej. `postgres` de Supabase) tiene `BYPASSRLS`, que
   ignora cualquier política.

`RLS_ENFORCED` (env) controla solo la mitad de la app: cuando es `true`,
`PrismaService.runWithTenantContext` abre una transacción por request y ejecuta
`set_config('app.current_tenant_id', …)`. Pero para que el enforcement sea real
**también** hace falta un rol de base de datos **sin** `BYPASSRLS`.

## Cómo activarlo

### 1. Crear un rol sin bypass y darle permisos

Ejecutar en tu Postgres (Supabase SQL Editor / psql), una sola vez:

```sql
-- Rol de aplicación SIN bypassrls (NO uses el rol postgres/owner).
CREATE ROLE simplecite_app LOGIN PASSWORD 'pon-un-password-fuerte';

GRANT CONNECT ON DATABASE simplecite TO simplecite_app;
GRANT USAGE ON SCHEMA public TO simplecite_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO simplecite_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO simplecite_app;

-- Que los permisos apliquen también a tablas/secuencias futuras.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO simplecite_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO simplecite_app;

-- Verifica que NO bypasea RLS (debe devolver false):
SELECT rolbypassrls FROM pg_roles WHERE rolname = 'simplecite_app';
```

> El helper `public.current_tenant_id()` y las políticas viven en
> `packages/database/prisma/rls/*.sql` (bootstrap) y en las migraciones
> `*_rls_*` / `phase17_rls_coverage`. En una DB nueva, corre el bootstrap de RLS
> **antes** de `prisma migrate deploy` (ver memoria "Fresh DB bootstrap order").

### 2. Apuntar la app al rol nuevo

Cambiar `DATABASE_URL` y `DIRECT_URL` para que usen `simplecite_app`:

```
DATABASE_URL="postgresql://simplecite_app:PASSWORD@HOST:5432/simplecite?schema=public"
DIRECT_URL="postgresql://simplecite_app:PASSWORD@HOST:5432/simplecite?schema=public"
```

### 3. Encender el flag

```
RLS_ENFORCED="true"
```

### 4. Validar

Con 2 tenants ficticios, confirmar que un usuario de la clínica A nunca ve datos
de la clínica B (citas, pacientes, servicios, horarios), y que el flujo normal
—login, listar/crear citas, disponibilidad, consulta— sigue funcionando.

## Cobertura de políticas

Con RLS enforced quedan aisladas por tenant: `tenants`, `users`,
`doctor_profiles`, `staff_profiles`, `patients`, `services`, `appointments`,
`medical_notes`, `medical_records`, `prescriptions`, `products`,
`doctor_services`, `doctor_schedule_rules`, `doctor_schedule_blocks`,
`patient_otps`. (`medical_records`/`prescriptions` además restringen por
rol/doctor en sus políticas EHR.)

## Limitaciones conocidas (revisar antes de poner enforced en prod)

- **Webhooks sin contexto de tenant.** Los handlers de pagos (QR) y de WhatsApp
  Cloud corren **fuera** de una request con tenant resuelto, así que no setean
  `app.current_tenant_id`. Por eso sus tablas (`payment_intents`,
  `payment_events`, `whatsapp_*`, `wa_conversations`) **no** tienen RLS habilitado
  y siguen protegidas solo por `where:{tenantId}`. Si en el futuro se les pone
  RLS, primero hay que hacer que esos handlers resuelvan el tenant (por el id del
  intent / del mensaje) y envuelvan su trabajo en `runWithTenantContext`. La
  tabla `appointments` que el webhook de pago actualiza **sí** tiene RLS: bajo
  enforcement, ese update debe ejecutarse dentro de `runWithTenantContext` con el
  tenant del intent.
- **Guards que leen la DB corren antes del interceptor.** `SubscriptionGuard` ya
  abre su propio contexto con `runWithTenantContext` para su lectura de `tenants`.
  Cualquier guard nuevo que consulte tablas con RLS debe hacer lo mismo.
- **Rate-limit de OTP por IP.** Bajo enforcement, el conteo por IP queda acotado
  al tenant actual (la política filtra `patient_otps`), no global entre tenants.
