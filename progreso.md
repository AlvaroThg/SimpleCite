# Progreso — SimpleCite

> Estado al **2026-06-06**. SaaS multi-tenant para clínicas en Bolivia: booking
> público, mini-EHR, pagos QR Simple y WhatsApp.

## Stack

NestJS (hexagonal/DDD) + Prisma + Supabase Postgres · Next.js 15 (App Router) +
Tailwind v4 · Turborepo + pnpm · Baileys (WhatsApp, 1 contenedor por tenant) ·
JWT propio + RBAC · Multi-tenancy por `where:{ tenantId }` (RLS dormante).

---

## ✅ Hecho

### Backend (API)

- Auth JWT + RBAC (guards Jwt → Tenant → Roles), aislamiento por `tenantId`.
- Booking público: tenant → doctor → servicio → slots → OTP WhatsApp → pago QR → confirmación.
- Citas (máquina de estados), Pacientes + EHR (notas clínicas con control de acceso por rol).
- Doctores, Servicios (+ asignación doctor↔servicio), Horarios (reglas semanales + bloqueos).
- Pagos QR Simple con webhooks idempotentes (HMAC, dedup por eventId) — **modo STUB en dev**.
- **ReportsModule**: `GET /reports/summary` (citas hoy, ingresos del mes, % inasistencia, próximas citas).
- **Branding del tenant**: `GET/PATCH /tenants/current` (nombre, logo, color).
- Flag **`RLS_ENFORCED`**: omite la transacción por request cuando RLS está dormante → menos latencia.
- 31 tests unitarios en verde.

### Frontend (web)

- **Landing** `simplecite.com.bo`: hero, problema/solución, 3 pasos, testimonios, pricing (Básico/Pro/Élite).
- **Branding azul real** del logo (#0a70f8) + Inter; wordmark e ícono en navbar, topbar, login, footer, favicon.
- **Skeletons** y spinner de marca (reemplazan "Cargando…").
- **Panel** con role-gating: Inicio (reportes), Citas, Pacientes, Servicios, Doctores, Horarios, Configuración.
- Configuración: branding editable + WhatsApp (crear/reiniciar/eliminar instancia, **QR vía SSE**).
- `panel-api.ts` tipado para todos los endpoints.

### Infra / DevEx

- Docker (API + whatsapp-instance), docker-compose dev/prod, Traefik, CI (lint/test/build/push GHCR).
- Docs: deploy-vps, runbook (criterios go-live), cloudflare, security-checklist, rls-enforcement.
- **Nueva DB Supabase en sa-east-1**: el API ya conecta (fuente única en `.env`, Opción A).
- `bootstrap-rls-functions.sql` + script `pnpm db:bootstrap` (crea `current_tenant_id()` etc.).

### Fixes recientes

- OTP throttler: rate-limit por teléfono+IP a nivel DB (per-phone 3/h, per-IP 30/h).
- API build: `incremental:false` evita el desync de `.tsbuildinfo` con `deleteOutDir` ("Cannot find module dist/main").
- API env: `envFilePath` incluye `../../.env.<entorno>` para hallar la config completa al correr vía Turbo.

---

## ⏳ Pendiente

### WhatsApp productivo

- [x] **Bug fix**: OTP incluido directamente en la respuesta del bot (antes `issueOtp()` retornaba el código pero los callers lo ignoraban — el paciente nunca lo recibía).
- [x] **Bug fix**: `WA_INSTANCE_IMAGE` leído desde `ConfigService`/`WA_INSTANCE_IMAGE` env var (antes hardcodeado a `simplecite-wa-instance:latest`, rompía en prod donde la imagen viene de GHCR con otro nombre).
- [x] **WaReminderService**: cron diario (08:00 Bolivia / 12:00 UTC) que envía recordatorios de citas CONFIRMED del día siguiente. Idempotente por `messageKey: reminder:{appointmentId}`.
- [x] **Cleanup cron**: `WhatsappHealthService` limpia conversaciones expiradas cada hora.
- [x] **Seguridad**: `WA_INTERNAL_SECRET` requerido en producción (invariante en `env.ts`).
- [ ] Vincular número real por QR en VPS (requiere deploy).
- [ ] (Plan Élite) WhatsApp API oficial de Meta.

### Pagos

- [ ] Integrar pasarela QR Simple real (hoy STUB en dev) + probar webhooks con firma real.

### Verificación / QA

- [ ] Regresión E2E sobre Docker (booking + pago + panel).
- [ ] Medir latencia antes/después del flag RLS y del cambio de región (sa-east-1).

### Landing / contenido

- [ ] Reemplazar `WA_NUMBER` placeholder (`59170000000`) por el número real de ventas.
- [ ] Testimonios reales (hoy son placeholder).

### Deploy — checklist de tareas físicas

#### 1. Compras / cuentas (fuera del repo)

- [ ] **SIM boliviana dedicada** para el bot de WhatsApp (no puede ser un número en uso).
- [ ] **VPS**: Hetzner CX22 (~$4/mes) o DigitalOcean 2GB (~$12/mes). Ubuntu 22.04 LTS. Elegir Frankfurt o NYC para latencia razonable desde Bolivia. Anotar la IP pública.
- [ ] **Cuenta QR Simple**: obtener `QR_SIMPLE_API_URL`, `QR_SIMPLE_API_KEY` y `QR_SIMPLE_WEBHOOK_SECRET` de producción.
- [ ] **Dominio** `simplecite.com.bo` activo y zona en Cloudflare (si aún no).

#### 2. Cloudflare (dashboard → DNS)

- [ ] Cambiar los nameservers del registrador del dominio a los de Cloudflare.
- [ ] Crear registro `A api.simplecite.com.bo → <IP del VPS>` (proxied ✓).
- [ ] Crear registro `CNAME *.simplecite.com.bo → cname.vercel-dns.com` (para subtenants en Vercel).
- [ ] SSL/TLS → modo **Full (strict)**.
- [ ] Security → WAF → activar el managed ruleset de Cloudflare.
- [ ] Security → Turnstile → crear widget para `simplecite.com.bo` → copiar la **Secret Key** (`TURNSTILE_SECRET_KEY`).

#### 3. VPS — primera vez (SSH)

```bash
# Docker
curl -fsSL https://get.docker.com | sh

# Firewall
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable

# Autenticarse en GHCR para poder hacer pull de las imágenes CI
echo "<GITHUB_TOKEN>" | docker login ghcr.io -u alvaroTHG --password-stdin
```

- [ ] Instalar Docker y configurar firewall (comandos arriba).
- [ ] Generar un GitHub Personal Access Token (scopes: `read:packages`) y autenticarse en GHCR.
- [ ] SSH hardening: deshabilitar login root por password (`PasswordAuthentication no` en `/etc/ssh/sshd_config`).

#### 4. Variables de entorno en el VPS

Crear `/root/simplecite/.env.production` con los valores reales (ver `.env.production.example`):

| Variable                       | Cómo obtenerla                                          |
| ------------------------------ | ------------------------------------------------------- |
| `DATABASE_URL`                 | Supabase → Connect → Transaction mode (puerto 6543)     |
| `DIRECT_URL`                   | Supabase → Connect → Direct (puerto 5432)               |
| `SUPABASE_URL` / `*_KEY`       | Supabase → Project Settings → API                       |
| `JWT_SECRET`                   | `openssl rand -base64 48`                               |
| `PATIENT_JWT_SECRET`           | `openssl rand -base64 48`                               |
| `QR_SIMPLE_API_URL/KEY/SECRET` | Dashboard de QR Simple                                  |
| `WA_INTERNAL_SECRET`           | `openssl rand -base64 32`                               |
| `WA_INSTANCE_IMAGE`            | `ghcr.io/alvaroTHG/simplecite/whatsapp-instance:latest` |
| `TURNSTILE_SECRET_KEY`         | Cloudflare → Turnstile (paso 2)                         |
| `APP_DOMAIN`                   | `simplecite.com.bo`                                     |
| `ACME_EMAIL`                   | tu email (para Let's Encrypt)                           |
| `GH_REPO`                      | `alvaroTHG/simplecite`                                  |
| `IMAGE_TAG`                    | `latest`                                                |

#### 5. Deploy inicial (VPS)

```bash
cd /root/simplecite
git clone https://github.com/alvaroTHG/simplecite .

# Migraciones (hacerlo UNA VEZ antes de levantar el API)
pnpm db:bootstrap          # funciones RLS helper
pnpm db:migrate:deploy     # migraciones
pnpm db:seed               # tenant demo (opcional en prod)

# Levantar Traefik + API
docker compose -f docker-compose.prod.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# Verificar
curl https://api.simplecite.com.bo/api/health
# → {"status":"ok","database":"ok"}
```

- [ ] Clonar el repo y crear `.env.production`.
- [ ] Correr migraciones (`db:bootstrap` → `db:migrate:deploy`).
- [ ] `docker compose ... up -d` y verificar el health check.

#### 6. Vercel (dashboard)

- [ ] Importar el repo de GitHub en Vercel (carpeta raíz: `apps/web`).
- [ ] Variables de entorno: `NEXT_PUBLIC_API_URL=https://api.simplecite.com.bo`.
- [ ] Agregar dominio personalizado: `simplecite.com.bo` (apex) + `*.simplecite.com.bo` (wildcard).
- [ ] Verificar que el CNAME wildcard de Cloudflare apunta al dominio de Vercel.

#### 7. QR Simple — registrar webhook

- [ ] En el dashboard de QR Simple, registrar la URL de webhook:
      `https://api.simplecite.com.bo/api/payments/webhook`

#### 8. Supabase

- [ ] Habilitar PITR (backups point-in-time) en el dashboard del proyecto → plan Pro.

#### 9. WhatsApp — vincular número (desde el panel admin)

- [ ] Insertar la SIM en un teléfono y registrar el número en WhatsApp.
- [ ] Abrir `https://clinica-demo.simplecite.com.bo/panel/settings`.
- [ ] Crear instancia → esperar QR → escanearlo con el teléfono de la SIM.
- [ ] Verificar que el estado queda **CONNECTED** y aparece el número vinculado.
- [ ] Retirar la SIM del teléfono (la sesión queda en el servidor; no necesita teléfono).

#### 10. Contenido pendiente

- [ ] Reemplazar `WA_NUMBER` placeholder (`59170000000`) en la landing por el número real de ventas.
- [ ] Reemplazar testimonios placeholder por testimonios reales.

### Seguridad / opcional

- [ ] (Opcional) Activar RLS real: rol sin bypassrls + `RLS_ENFORCED=true` (infra lista, ver `docs/rls-enforcement.md`).
- [ ] Habilitar PITR (backups) en Supabase Pro para go-live.

---

## Cómo correr en local

```powershell
pnpm db:generate          # cliente Prisma
pnpm dev:api              # API  (3001)
pnpm dev:web              # web  (3000)
```

> No usar `pnpm dev` (raíz) si no quieres arrancar `whatsapp-instance`, que corre
> dentro de su propio contenedor Docker, no localmente.

- Landing: http://localhost:3000/
- Panel: http://localhost:3000/panel/login (slug `clinica-demo`)
