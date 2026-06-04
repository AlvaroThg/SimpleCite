# Runbook de operación — SimpleCite

Procedimientos operativos y criterios de go-live para el MVP.

---

## 1. Rotación de secretos

Secretos en `.env.production` (nunca en git). Rotación recomendada: trimestral
o ante sospecha de filtración.

| Secreto                    | Impacto al rotar                                        | Procedimiento                                                   |
| -------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| `JWT_SECRET`               | Invalida sesiones de staff/doctor (re-login)            | Generar `openssl rand -base64 48`, actualizar env, redeploy api |
| `PATIENT_JWT_SECRET`       | Invalida sesiones de pacientes en curso                 | Igual; impacto bajo (sesión 30 min)                             |
| `WA_INTERNAL_SECRET`       | Webhooks de Baileys rechazados hasta recrear instancias | Rotar env, **recrear** contenedores WA (traen el nuevo secret)  |
| `QR_SIMPLE_API_KEY`        | Pagos fallan hasta actualizar                           | Coordinar con el proveedor; rotar env; redeploy                 |
| `QR_SIMPLE_WEBHOOK_SECRET` | Webhooks de pago rechazados                             | Actualizar en el proveedor Y en env simultáneamente             |
| DB password                | —                                                       | Rotar en Supabase → actualizar `DATABASE_URL`/`DIRECT_URL`      |

Tras rotar: `docker compose -f docker-compose.prod.yml up -d api` y verificar
`/api/health` + un login de prueba.

---

## 2. Alta de un tenant (clínica)

No hay UI de onboarding aún (MVP). Alta manual:

1. Crear el tenant + admin (script o SQL, con password bcrypt):
   - `slug` único (será el subdominio: `clinica-x.simplecite.com.bo`).
   - `status = ACTIVE`, `timezone = America/La_Paz`.
   - Usuario `ADMIN` con `bcrypt(password)`.
2. (DNS) El wildcard `*.simplecite.com.bo` ya cubre el nuevo slug → no requiere
   cambio de DNS.
3. El admin entra a `…/panel/login` con su slug, da de alta doctores, servicios,
   horarios.
4. (Opcional) WhatsApp: el admin crea la instancia desde el panel y escanea el QR.

> Post-MVP: endpoint/CLI de onboarding que haga esto transaccionalmente.

---

## 3. Recuperación de instancias WhatsApp

| Síntoma                           | Causa probable                       | Acción                                                                                                   |
| --------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Estado `DISCONNECTED` persistente | Sesión cerrada en el teléfono        | Recrear instancia + re-escanear QR                                                                       |
| Estado `ERROR`                    | Contenedor crasheó / imagen faltante | `POST /admin/whatsapp/instances/:id/restart`; si falla, destruir y recrear                               |
| QR no aparece                     | Contenedor no arrancó                | `docker logs wa-<slug>`; verificar imagen `simplecite-wa-instance:latest`                                |
| Tras reinicio del VPS             | —                                    | Las instancias con `restart:unless-stopped` vuelven solas y reusan el volumen de sesión (no re-piden QR) |

El health-check cron (cada 30s) sincroniza el estado real a la DB. El estado se
ve en el panel admin.

---

## 4. Replay / reproceso de webhooks de pago

Los webhooks son **idempotentes** (dedup por `eventId` en `payment_events`).

- **Reenviar un webhook**: reenviarlo es seguro — si el `eventId` ya se procesó,
  responde `{deduplicated:true}` sin efectos.
- **Webhook perdido** (pago real sin confirmar): pedir al proveedor el reenvío,
  o conciliar manualmente:
  1. Buscar el `PaymentIntent` por `providerPaymentId`.
  2. Si el proveedor confirma el pago, construir el payload y POST firmado a
     `/api/webhooks/payments` (con `X-Signature` = HMAC-SHA256 del body con
     `QR_SIMPLE_WEBHOOK_SECRET`).
- **Auditoría**: `payment_events.rawPayload` guarda todo lo recibido (incluso
  webhooks sin intent asociado).
- **Intents colgados**: el cron de conciliación (cada minuto) expira intents
  `PENDING` vencidos y cancela citas sin pago, liberando el slot.

---

## 5. Backups y recuperación

| Dato              | Dónde                                   | Backup                                                     |
| ----------------- | --------------------------------------- | ---------------------------------------------------------- |
| Base de datos     | Supabase                                | **PITR + backup diario** (habilitar en dashboard Supabase) |
| Sesiones WhatsApp | Volúmenes `wa-session-<slug>` en el VPS | tar a object storage por cron (ver `deploy-vps.md` §6)     |
| Secretos          | gestor de secretos / `.env.production`  | copia cifrada offline                                      |

**Restore de DB**: desde Supabase (PITR al timestamp). **Restore de sesión WA**:
restaurar el volumen y recrear el contenedor; si el backup es viejo, re-escanear QR.

---

## 6. Migrations: paso controlado

- Las migraciones se aplican con `pnpm db:migrate:deploy` (usa `DIRECT_URL`),
  **antes** de subir la imagen que las requiere — nunca en caliente con tráfico.
- Cada migración es un `.sql` versionado en `packages/database/prisma/migrations/`.
- Orden de un release con migración:
  1. `db:migrate:deploy` (migración compatible hacia atrás).
  2. `docker compose pull api && up -d api` (nueva imagen).
- Rollback de schema: escribir una migración inversa (no `prisma migrate reset`
  en prod).

---

## 7. Checklist de release

- [ ] CI verde (lint, format, **tests**, build, db-validate).
- [ ] Migraciones revisadas y compatibles hacia atrás.
- [ ] `assertProductionInvariants` pasa (todos los secrets de prod presentes).
- [ ] Imagen `api` publicada en GHCR con tag de commit.
- [ ] `db:migrate:deploy` aplicado.
- [ ] Deploy de api + smoke test (`/health`, login, booking de prueba).
- [ ] Web (Vercel) apuntando a la API correcta.

---

## 8. Criterios "go-live" (MVP)

**Funcionales**

- [ ] Booking público end-to-end (doctor→servicio→slot→OTP→pago→confirmación).
- [ ] Panel staff/doctor: login, citas, historial, notas.
- [ ] WhatsApp: al menos una instancia conectada; OTP real llega; bot responde.
- [ ] Pago: QR real de QR Simple + webhook confirmando (cuando haya credenciales).

**No funcionales / seguridad**

- [ ] HTTPS forzado (Traefik + Cloudflare Full strict).
- [ ] WAF y rate limits en Cloudflare para `/webhooks/*` y `/public/*`.
- [ ] Secrets de prod rotados (no los de ejemplo).
- [ ] Backups de Supabase habilitados (PITR).
- [ ] Checklist de seguridad (`security-checklist.md`) revisado.
- [ ] **Decisión sobre RLS**: activar enforcement real (`rls-enforcement.md`) o
      aceptar formalmente el aislamiento app-layer para el MVP.

**Operación**

- [ ] Alertas básicas: healthcheck del API + uptime monitor externo (ej. UptimeRobot).
- [ ] Runbook accesible al equipo de operación.
