# Deploy en VPS (manual con docker compose)

> **Recomendado: [deploy-dokploy.md](deploy-dokploy.md).** Dokploy gestiona
> Traefik, TLS, la base de datos y los builds por ti. Esta guía es el camino
> **manual** con `docker-compose.prod.yml` para quien prefiere control total.

Pasos marcados **[manual]** se hacen en el proveedor o por SSH; el resto usa
`docker-compose.prod.yml`.

## Arquitectura en producción

```
                 Cloudflare (DNS + SSL Full strict + WAF)
                              │
                  ┌───────────┴───────────┐
                  ▼                        ▼
        simplecite.com.bo          api.simplecite.com.bo
                  └───────────┬───────────┘
                              ▼
                      Traefik (VPS :443)
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
                web         api      wa-<slug> (Baileys,
            (Next.js)    (NestJS)    red interna, sin puerto)
                              │
                              ▼
                      db (Postgres, red interna)
                Cloudflare R2 (storage de archivos, externo)
```

- **Web + API**: contenedores en el VPS detrás de Traefik (TLS automático).
- **DB**: Postgres en contenedor (`simplecite-pgdata` persistente). Sin Supabase.
- **Storage**: Cloudflare R2 (S3-compatible). Sin almacenamiento local.

## 1. Provisión del servidor **[manual]**

1. VPS Hetzner CPX31/CPX41 (8GB), Ubuntu 24.04. Cada instancia Baileys usa
   ~256MB → dimensiona según nº de tenants.
2. DNS en Cloudflare: `A api.simplecite.com.bo → <IP>` y `A simplecite.com.bo →
<IP>`. Para que Traefik emita certs TLS-ALPN, deja **DNS-only** al inicio (o
   usa Cloudflare "Full (strict)").
3. Firewall (UFW): solo 22, 80, 443.
   ```bash
   ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
   ```
4. Hardening SSH: sin login root por password, solo llaves.

## 2. Instalar Docker **[manual]**

```bash
curl -fsSL https://get.docker.com | sh
```

## 3. Construir la imagen Baileys **[manual, una vez]**

El orquestador referencia `simplecite-wa-instance:latest` localmente:

```bash
git clone <repo> /opt/simplecite && cd /opt/simplecite
docker build -t simplecite-wa-instance:latest apps/whatsapp-instance/
```

## 4. Variables de entorno **[manual]**

```bash
cp .env.production.example .env.production
# Editar con secretos reales
```

Claves: `APP_DOMAIN`, `ACME_EMAIL`, `DATABASE_URL`/`DIRECT_URL` (apuntan al
servicio `db`: `postgresql://USER:PASS@simplecite-db:5432/simplecite?schema=public`),
`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`, `JWT_SECRET`,
`PATIENT_JWT_SECRET`, `R2_*`, `PAYPAL_*`, `WA_INTERNAL_SECRET`,
`NEXT_PUBLIC_API_URL` (= `https://api.${APP_DOMAIN}`), `NEXT_PUBLIC_PAYPAL_*`,
`TURNSTILE_SECRET_KEY`, `RLS_ENFORCED` (default `false`).

## 5. Levantar

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### 5.1 Base de datos nueva — orden OBLIGATORIO

Una DB fresca no tiene las funciones RLS helper (`current_tenant_id()`, etc.) que
las migraciones referencian pero no crean. Corre el bootstrap **antes** de migrar,
**dentro del contenedor API** (los scripts `db:*` usan `dotenv -e ../../.env`, que
no existe en la imagen; la `DATABASE_URL` ya viene del `env_file`):

```bash
docker compose -f docker-compose.prod.yml exec api sh -c \
  "cd /app/packages/database && ./node_modules/.bin/prisma db execute --schema prisma/schema.prisma --file scripts/bootstrap-rls-functions.sql"
docker compose -f docker-compose.prod.yml exec api sh -c \
  "cd /app/packages/database && ./node_modules/.bin/prisma migrate deploy"
# Onboarding del primer tenant (en vez del seed de prueba):
docker compose -f docker-compose.prod.yml exec api sh -c \
  "cd /app/apps/api && node dist/cli/create-tenant.js --name='Clínica X' --slug='clinica-x' --adminEmail='admin@clinica-x.com' --password='secreto123' --adminPhone='59170000000'"
```

Verificar:

```bash
curl https://api.simplecite.com.bo/api/health   # {status:ok}
```

## 6. Webhook de PayPal

Apunta el webhook en el dashboard de PayPal a
`https://api.simplecite.com.bo/api/webhooks/paypal` y copia el Webhook ID a
`PAYPAL_WEBHOOK_ID`.

## 7. Healthchecks, logs y backups

- **Health**: `api` y `web` tienen healthcheck; Traefik solo rutea a sanos.
- **Logs**: `json-file` con rotación (10MB ×5). `docker compose -f
docker-compose.prod.yml logs -f api`.
- **Backups DB**: dump del volumen `simplecite-pgdata` por cron:
  ```bash
  docker compose -f docker-compose.prod.yml exec -T db \
    pg_dump -U simplecite simplecite | gzip > backup-$(date +%F).sql.gz
  ```
  Subir a object storage (R2). Sesiones WhatsApp: respaldar volúmenes
  `wa-session-<slug>`.

## 8. Actualizaciones

```bash
cd /opt/simplecite && git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
# Migraciones nuevas (el bootstrap solo se corre una vez en la DB fresca):
docker compose -f docker-compose.prod.yml exec api sh -c \
  "cd /app/packages/database && ./node_modules/.bin/prisma migrate deploy"
```

## 9. Recuperación de instancias WhatsApp

Con `restart: unless-stopped`, los `wa-<slug>` vuelven solos tras un reinicio y
reusan su volumen de sesión (no re-piden QR). Si una queda en ERROR, recrearla
desde el panel admin (Configuración → WhatsApp) o `POST /admin/whatsapp/instances`.
