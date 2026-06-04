# Deploy en VPS (Hetzner / DigitalOcean)

Guía de provisión. Los pasos marcados **[manual]** se hacen en el proveedor o
por SSH; el resto usa artefactos del repo (`docker-compose.prod.yml`).

## Arquitectura en producción

```
                 Cloudflare (DNS wildcard + SSL strict + WAF)
                              │
                  ┌───────────┴───────────┐
                  ▼                        ▼
        *.simplecite.com.bo         api.simplecite.com.bo
        (Vercel — Next.js)          (VPS — Traefik :443)
                                           │
                                    ┌──────┴───────┐
                                    ▼              ▼
                              simplecite-api   wa-<slug>  (Baileys,
                              (NestJS :3001)    red interna, sin puerto
                                    │           expuesto)
                                    ▼
                              Supabase (Postgres gestionado)
```

- **Web**: Vercel (deploy separado, `NEXT_PUBLIC_API_URL=https://api.simplecite.com.bo`).
- **API + orquestador WhatsApp**: un VPS con Docker. El orquestador vive dentro
  del API (monolito modular) y crea contenedores Baileys vía el socket Docker.
- **DB**: Supabase (no se hostea Postgres en el VPS).

## 1. Provisión del servidor **[manual]**

1. Crear un VPS (Hetzner CX22 / DO 2GB+). Ubuntu 22.04 LTS. Cada instancia
   Baileys usa ~256MB → dimensionar según nº de tenants (ej. 4GB ≈ 10 tenants).
2. DNS en Cloudflare: `A api.simplecite.com.bo → <IP del VPS>` (proxied).
   El wildcard `*.simplecite.com.bo` apunta a Vercel (ver `cloudflare.md`).
3. Firewall (UFW): permitir solo 22, 80, 443.
   ```bash
   ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
   ```
4. Hardening SSH: deshabilitar login root por password, usar llaves.

## 2. Instalar Docker **[manual]**

```bash
curl -fsSL https://get.docker.com | sh
# (opcional) usuario no-root en el grupo docker
usermod -aG docker deploy
```

## 3. Construir la imagen Baileys en el VPS **[manual, una vez]**

El orquestador referencia `simplecite-wa-instance:latest` localmente. En el VPS:

```bash
git clone <repo> simplecite && cd simplecite
docker build -t simplecite-wa-instance:latest apps/whatsapp-instance/
```

> Alternativa: publicar también esta imagen en GHCR y `docker pull`.

## 4. Configurar variables de entorno **[manual]**

```bash
cp .env.production.example .env.production
# Editar con secretos reales (ver runbook.md → rotación de secretos)
```

Variables clave: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `PATIENT_JWT_SECRET`,
`QR_SIMPLE_*`, `WA_INTERNAL_SECRET`, `TURNSTILE_SECRET_KEY`, `APP_DOMAIN`,
`ACME_EMAIL`, `GH_REPO`, `IMAGE_TAG`.

## 5. Levantar

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Traefik obtiene el certificado de Let's Encrypt automáticamente para
`api.${APP_DOMAIN}`. Verificar:

```bash
curl https://api.simplecite.com.bo/api/health   # {status:ok, database:ok}
```

## 6. Healthchecks, logs y backups

- **Health**: el contenedor `api` tiene healthcheck (`/api/health`). Traefik solo
  rutea a contenedores sanos.
- **Logs**: `json-file` con rotación (10MB ×5). Para centralizar: enviar a Loki o
  al stack de logs del proveedor. `docker compose logs -f api`.
- **Backups**: la DB está en Supabase → habilitar **PITR / backups diarios** en
  el dashboard de Supabase (no en el VPS). Para las sesiones de WhatsApp
  (volúmenes `wa-session-<slug>`): `docker run --rm -v wa-session-<slug>:/s -v
$PWD:/b alpine tar czf /b/wa-<slug>.tgz /s` en un cron, subir a object storage.

## 7. Actualizaciones (deploy de nueva versión)

CI publica `ghcr.io/<repo>/api:sha-<commit>` y `:latest`. Para actualizar:

```bash
export IMAGE_TAG=sha-<commit>   # o latest
docker compose -f docker-compose.prod.yml --env-file .env.production pull api
docker compose -f docker-compose.prod.yml --env-file .env.production up -d api
```

Migraciones de DB: se aplican de forma controlada **antes** de subir la nueva
imagen (ver runbook → "migrations step controlado"):

```bash
pnpm db:migrate:deploy   # desde un entorno con DIRECT_URL, no en caliente
```

## 8. Recuperación de instancias WhatsApp

Si el VPS reinicia, los contenedores Baileys con `restart: unless-stopped`
vuelven solos y reusan su volumen de sesión (no re-piden QR). Si una instancia
queda en ERROR, recrearla desde el panel admin (`POST /admin/whatsapp/instances`).
Ver runbook → "recuperación de instancias WhatsApp".
