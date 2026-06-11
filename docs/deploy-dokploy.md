# Deploy en Dokploy (Hetzner) — recomendado

Guía paso a paso para desplegar SimpleCite en un VPS con **Dokploy**. Dokploy
gestiona Traefik (routing + TLS Let's Encrypt), la base de datos y construye cada
app desde su Dockerfile. Para el camino manual con `docker compose`, ver
[deploy-vps.md](deploy-vps.md).

## Arquitectura

```
Hetzner VPS (Ubuntu, ~8GB)
└── Dokploy  (Traefik integrado: routing + TLS)
    ├── PostgreSQL          (Database gestionada de Dokploy)
    ├── API (NestJS)        Dockerfile raíz       → api.simplecite.com.bo
    ├── Web (Next.js)       apps/web/Dockerfile   → simplecite.com.bo
    └── wa-{slug}           contenedores Baileys que el API crea solo
                            (red simplecite-internal + socket Docker)
Cloudflare R2   → almacenamiento de archivos (externo)
Cloudflare DNS  → A records a la IP del VPS
```

Puntos no obvios (ver detalle abajo): el API necesita el **socket de Docker**
para crear los `wa-{slug}`; la web usa **dos bases de API** (navegador vs SSR); y
una DB nueva exige **bootstrap → migrate → seed** en ese orden.

---

## Fase 0 — Prerrequisitos

- Dominio en Cloudflare (`simplecite.com.bo`).
- Cuenta Cloudflare R2 con un bucket y API token (Access Key / Secret).
- App de PayPal (Sandbox para pruebas, Live para producción) + Plan de suscripción.

## Fase 1 — VPS Hetzner

1. Servidor **CPX31/CPX41** (8GB), **Ubuntu 24.04**, con tu SSH key.
2. DNS en Cloudflare, **DNS only (nube gris)** al inicio para que Traefik emita
   los certs TLS-ALPN:
   - `A  api.simplecite.com.bo  → <IP>`
   - `A  simplecite.com.bo      → <IP>` (apex; o usa `app.` si prefieres)
3. Firewall: abre solo `22, 80, 443`.

## Fase 2 — Instalar Dokploy

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Abre `http://<IP>:3000` y crea el usuario admin.

## Fase 3 — PostgreSQL

Dokploy → **Create → Database → PostgreSQL**. Crea DB `simplecite` con usuario y
password. Anota el **hostname interno** (ej. `simplecite-db-xxxx`):

- `DATABASE_URL = postgresql://USER:PASS@<host-interno>:5432/simplecite?schema=public`
- `DIRECT_URL` = **lo mismo** (sin pgBouncer, una sola URL directa).

## Fase 4 — Red interna + imagen del bot (SSH)

```bash
docker network create simplecite-internal
git clone <repo> /opt/simplecite && cd /opt/simplecite
docker build -t simplecite-wa-instance:latest ./apps/whatsapp-instance
```

## Fase 5 — Aplicación API

Dokploy → **Create → Application** → conecta el repo:

- **Build:** Dockerfile · **Path:** `Dockerfile` · **Context:** `.`
- **Domain:** `api.simplecite.com.bo` · **Port:** `3001` · **HTTPS:** on
- **Advanced → Volumes:** `/var/run/docker.sock:/var/run/docker.sock`
- **Advanced → Networks:** añade `simplecite-internal`
- **Environment:**

| Variable                                                                              | Valor                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `NODE_ENV`                                                                            | `production`                                                 |
| `API_PORT`                                                                            | `3001`                                                       |
| `APP_DOMAIN`                                                                          | `simplecite.com.bo`                                          |
| `DATABASE_URL` / `DIRECT_URL`                                                         | (Fase 3)                                                     |
| `JWT_SECRET`                                                                          | 32+ aleatorio                                                |
| `PATIENT_JWT_SECRET`                                                                  | 32+ aleatorio, **distinto**                                  |
| `JWT_EXPIRATION`                                                                      | `12h`                                                        |
| `R2_ACCOUNT_ID` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` `R2_BUCKET` `R2_PUBLIC_URL` | de Cloudflare R2                                             |
| `PAYPAL_API_BASE`                                                                     | sandbox o `https://api-m.paypal.com`                         |
| `PAYPAL_CLIENT_ID` `PAYPAL_CLIENT_SECRET` `PAYPAL_WEBHOOK_ID`                         | de PayPal                                                    |
| `WA_DOCKER_NETWORK`                                                                   | `simplecite-internal`                                        |
| `WA_CALLBACK_URL`                                                                     | `http://<contenedor-api>:3001/api/internal/whatsapp/webhook` |
| `WA_INTERNAL_SECRET`                                                                  | 16+ aleatorio                                                |
| `WA_INSTANCE_IMAGE`                                                                   | `simplecite-wa-instance:latest`                              |
| `TURNSTILE_SECRET_KEY`                                                                | recomendado (vacío = sin verificación)                       |
| `RLS_ENFORCED`                                                                        | `false`                                                      |

Deploy. Ajusta `WA_CALLBACK_URL` al nombre real del contenedor del API (Dokploy
lo muestra) tras el primer deploy.

## Fase 6 — Migraciones (orden OBLIGATORIO)

Una DB nueva no tiene las funciones RLS helper (`current_tenant_id()`, etc.); las
migraciones las referencian pero no las crean. En la **terminal del contenedor
API** (Dokploy → API → Terminal) NO uses los scripts `db:*` (envuelven
`dotenv -e ../../.env`, archivo que no existe en la imagen). Llama los binarios:

```bash
cd /app/packages/database
./node_modules/.bin/prisma db execute --schema prisma/schema.prisma --file scripts/bootstrap-rls-functions.sql
./node_modules/.bin/prisma migrate deploy
# Onboarding real (en vez del seed de prueba):
cd /app/apps/api && node dist/cli/create-tenant.js \
  --name="Clínica X" --slug="clinica-x" --adminEmail="admin@clinica-x.com" \
  --password="secreto123" --adminPhone="59170000000"
```

## Fase 7 — Aplicación Web

Dokploy → **Create → Application** (mismo repo):

- **Dockerfile:** `apps/web/Dockerfile` · **Context:** `.`
- **Domain:** `simplecite.com.bo` · **Port:** `3000` · **HTTPS:** on
- **Networks:** `simplecite-internal`
- **Build Args** (se inlinean en build → navegador):
  - `NEXT_PUBLIC_API_URL=https://api.simplecite.com.bo`
  - `NEXT_PUBLIC_PAYPAL_CLIENT_ID=...` · `NEXT_PUBLIC_PAYPAL_PLAN_ID=...`
- **Environment (runtime → SSR):**
  - `INTERNAL_API_URL=http://<contenedor-api>:3001`
  - `NODE_ENV=production`

> **Por qué dos URLs:** la landing hace fetch en el servidor (SSR, dentro del
> contenedor) y el panel/booking en el navegador. El navegador no alcanza la red
> interna y el SSR no debe salir a internet. Ver `apps/web/src/lib/api-base.ts`.

## Fase 8 — Webhook de PayPal

En el dashboard de PayPal, apunta el webhook a:

```
https://api.simplecite.com.bo/api/webhooks/paypal
```

Copia el **Webhook ID** a `PAYPAL_WEBHOOK_ID` (se usa para verificar la firma).

## Fase 9 — Verificación

- `https://api.simplecite.com.bo/api/health` → `200`
- `https://simplecite.com.bo/<slug>` → landing del tenant (SSR por red interna)
- Panel → **Configuración → + Conectar WhatsApp** → escanea el QR.
- Cita con QR estático → comprobante por WhatsApp → aprobar en el panel.

## Actualizaciones

Push a la rama → Dokploy reconstruye. Las **migraciones nuevas** se aplican en la
terminal del contenedor con `prisma migrate deploy` (el bootstrap solo se corre
una vez, en la DB fresca). La imagen `simplecite-wa-instance:latest` se reconstruye
en el host solo si cambia `apps/whatsapp-instance`.
