# Deploy del Compose en Dokploy

> Despliega el stack como un servicio **Compose** dentro de Dokploy.
> `docker-compose.prod.yml` trae `db + api + web` **sin Traefik**: Dokploy aporta
> Traefik + TLS + routing. Alternativa (apps nativas separadas):
> [deploy-dokploy.md](deploy-dokploy.md).

Pasos marcados **[manual]** se hacen por SSH; el resto en la UI de Dokploy.

## Arquitectura en producción

```
                 Cloudflare (DNS + SSL Full strict)
                              │
                  ┌───────────┴───────────┐
                  ▼                        ▼
        simplecite.com.bo          api.simplecite.com.bo
                  └───────────┬───────────┘
                              ▼
                   Dokploy (Traefik + TLS)
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
                web         api      wa-<slug> (Baileys,
            (Next.js)    (NestJS)    red interna, sin puerto)
                              │
                              ▼
                      db (Postgres, red interna)
                Cloudflare R2 (storage de archivos, externo)
```

- **db + api + web**: definidos en `docker-compose.prod.yml`, sin publicar
  puertos; Dokploy los enruta por la `dokploy-network`.
- **TLS/dominios**: los gestiona Dokploy (no hay Traefik ni `ACME_EMAIL` en el
  compose). Se configuran en la pestaña **Domains** del servicio Compose.
- **DB**: Postgres en contenedor (`simplecite-pgdata` persistente). Sin Supabase.
- **Storage**: Cloudflare R2 (S3-compatible).

## 1. VPS + Dokploy **[manual]**

Sigue las Fases 1-2 de [deploy-dokploy.md](deploy-dokploy.md): VPS Hetzner
(8GB, Ubuntu 24.04), DNS en Cloudflare (`api.` y apex a la IP, DNS-only al
inicio), firewall (22/80/443) e instalar Dokploy.

## 2. Red interna + imagen del bot **[manual, SSH]**

El compose usa la red `simplecite-internal` y el API referencia
`simplecite-wa-instance:latest`:

```bash
docker network create simplecite-internal
git clone <repo> /opt/simplecite && cd /opt/simplecite
docker build -t simplecite-wa-instance:latest apps/whatsapp-instance/
```

## 3. Servicio Compose en Dokploy

1. **Create → Compose**, conecta el repo y apunta a `docker-compose.prod.yml`.
2. **Environment**: pega el contenido de tu `.env.production` (ver
   `.env.production.example`). Incluye Postgres, JWT, R2, PayPal, WA y
   `NEXT_PUBLIC_*` (estas se inlinean en el build de la web).
3. **Domains**:
   - host `api.${APP_DOMAIN}` → service **api**, container port **3001**, HTTPS.
   - host `${APP_DOMAIN}` → service **web**, container port **3000**, HTTPS.
     Dokploy inyecta los labels de Traefik y emite el certificado.
4. **Deploy**. Dokploy construye las imágenes (api + web) desde los Dockerfile.

## 4. Base de datos nueva — orden OBLIGATORIO

Una DB fresca no tiene las funciones RLS helper (`current_tenant_id()`, etc.) que
las migraciones referencian pero no crean. En la **terminal del contenedor API**
(Dokploy → servicio → Terminal) NO uses los scripts `db:*` (envuelven
`dotenv -e ../../.env`, que no existe en la imagen; la `DATABASE_URL` ya viene del
`env_file`):

```bash
cd /app/packages/database
./node_modules/.bin/prisma db execute --schema prisma/schema.prisma --file scripts/bootstrap-rls-functions.sql
./node_modules/.bin/prisma migrate deploy
# Onboarding del primer tenant (en vez del seed de prueba):
cd /app/apps/api && node dist/cli/create-tenant.js \
  --name="Clínica X" --slug="clinica-x" --adminEmail="admin@clinica-x.com" \
  --password="<pass-fuerte>" --adminPhone="59170000000"
```

Verificar: `https://api.simplecite.com.bo/api/health` → `{status:ok}`.

## 5. Webhook de PayPal

Apunta el webhook en el dashboard de PayPal a
`https://api.simplecite.com.bo/api/webhooks/paypal` y copia el Webhook ID a
`PAYPAL_WEBHOOK_ID`.

## 6. Healthchecks, logs y backups

- **Health**: `api` y `web` tienen healthcheck; Dokploy/Traefik solo rutea a sanos.
- **Logs**: `json-file` con rotación (10MB ×5), visibles en la UI de Dokploy.
- **Backups DB**: por cron en el host,
  ```bash
  docker exec simplecite-db pg_dump -U simplecite simplecite | gzip > backup-$(date +%F).sql.gz
  ```
  Subir a object storage (R2). Sesiones WhatsApp: respaldar volúmenes
  `wa-session-<slug>`.

## 7. Actualizaciones

Push a la rama → Dokploy reconstruye el Compose. Migraciones nuevas: corre
`prisma migrate deploy` en la terminal del contenedor (el bootstrap solo una vez,
en la DB fresca). La imagen `simplecite-wa-instance:latest` se reconstruye en el
host solo si cambia `apps/whatsapp-instance`.

## 8. Recuperación de instancias WhatsApp

Con `restart: unless-stopped`, los `wa-<slug>` vuelven solos tras un reinicio y
reusan su volumen de sesión (no re-piden QR). Si una queda en ERROR, recrearla
desde el panel admin (Configuración → WhatsApp).

> **Deploy 100% manual sin Dokploy:** este compose ya no incluye Traefik. Si
> quieres correrlo con `docker compose up` puro, tendrás que añadir tu propio
> reverse proxy con TLS (Traefik/Caddy) delante de `web:3000` y `api:3001`.
