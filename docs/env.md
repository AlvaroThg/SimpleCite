# Variables de entorno — SimpleCite

Referencia completa para producción (Dokploy) y desarrollo. **Este archivo no
contiene valores**, solo nombres, obligatoriedad y descripción. Los valores
reales viven en el Environment del Compose de Dokploy (prod) y en los `.env*`
gitignored (dev). La validación al arrancar vive en
`apps/api/src/common/config/env.schema.ts`: si falta una obligatoria, el API
no arranca y dice exactamente cuál.

## Obligatorias siempre (el API no arranca sin ellas)

| Variable             | Descripción                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | Postgres, `postgresql://user:pass@host:5432/db?schema=public`. En el compose el host es `simplecite-db`. |
| `DIRECT_URL`         | Igual que `DATABASE_URL` (sin pgBouncer son idénticas). La usa `prisma migrate deploy`.                  |
| `JWT_SECRET`         | Secret del JWT de staff (admin/doctor/recepción). **Mínimo 32 caracteres aleatorios.**                   |
| `PATIENT_JWT_SECRET` | Secret del JWT de paciente (flujo OTP). Separado a propósito del de staff. Mínimo 32.                    |

## Obligatorias solo en producción

| Variable                                    | Descripción                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `APP_DOMAIN`                                | Dominio raíz (ej. `simplecite.com.bo`). Alimenta el CORS (`*.dominio`) y el `Domain` de la cookie de sesión.      |
| `R2_ACCOUNT_ID` _(o `R2_ENDPOINT`)_         | Cuenta de Cloudflare R2; de aquí se deriva el endpoint S3.                                                        |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Credenciales del API token de R2.                                                                                 |
| `R2_BUCKET`                                 | Nombre del bucket (`simplecite`). Carpetas por clínica: `<slug>/assets`, `<slug>/doctors/<id>`, `<slug>/gallery`. |
| `R2_PUBLIC_URL`                             | URL pública del bucket (`https://pub-….r2.dev` o dominio propio).                                                 |

## Opcionales con default

| Variable                            | Default       | Descripción                                                                        |
| ----------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `NODE_ENV`                          | `development` | Entorno.                                                                           |
| `API_PORT`                          | `3001`        | Puerto del API.                                                                    |
| `WEB_PORT`                          | `3000`        | Puerto de la web (solo compose).                                                   |
| `JWT_EXPIRATION`                    | `12h`         | Vida del JWT de staff (= vida de la cookie de sesión).                             |
| `PATIENT_SESSION_TTL`               | `30m`         | Vida de la sesión de paciente (flujo OTP).                                         |
| `PUBLIC_BOOKING_REQUIRE_OTP`        | `false`       | `false` = booking abierto (Turnstile + rate limit). `true` solo con el bot activo. |
| `OTP_TTL_MINUTES`                   | `10`          | Vida del código OTP.                                                               |
| `TENTATIVE_APPOINTMENT_TTL_MINUTES` | `15`          | Cuánto bloquea el slot una reserva a medio completar.                              |
| `RLS_ENFORCED`                      | `false`       | Enforcement RLS en DB (dormido; el aislamiento es app-layer).                      |

## Anti-bot (recomendadas en prod)

| Variable                         | Descripción                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `TURNSTILE_SECRET_KEY`           | Secret de Cloudflare Turnstile. Vacía = el check es no-op (booking sin anti-bot). |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Site key pública. **Build arg de la web** (se inlinea en el bundle).              |

## Web (Next.js)

| Variable                     | Descripción                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`        | URL pública del API para el navegador (`https://api.<dominio>`). **Build arg** — cambiarla exige rebuild de la web.         |
| `INTERNAL_API_URL`           | URL del API para SSR por red interna (`http://simplecite-api:3001`). Runtime.                                               |
| `NEXT_PUBLIC_LIGHTWIDGET_ID` | Opcional: widget de Instagram (LightWidget) en la landing.                                                                  |
| `NEXT_PUBLIC_BOT_URL`        | Opcional: base del bot de reservas (`https://t.me/<bot>` o `https://wa.me/<nro>`). **Build arg.** Vacío = sin CTAs de chat. |

## Enlaces salientes del API

| Variable         | Descripción                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WEB_PUBLIC_URL` | Base del frontend (`https://simplecite.com.bo`) para el magic link de cancelación que se manda por chat. Vacía = se ofrece cancelar por el mismo chat en vez de mandar el token pelado. |

## Mensajería al paciente

El canal de **producción** es la WhatsApp Cloud API oficial de Meta: un único
número para toda la plataforma. Sin las `META_WA_*` el canal es un no-op
silencioso — el API arranca igual y el resto del producto funciona.

| Variable                  | Descripción                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `META_WA_PHONE_NUMBER_ID` | Id del número emisor en Meta.                                                                            |
| `META_WA_ACCESS_TOKEN`    | Token permanente de la app de Meta.                                                                      |
| `META_WA_VERIFY_TOKEN`    | Cadena del handshake `GET /api/webhooks/whatsapp` al registrar la URL.                                   |
| `META_WA_APP_SECRET`      | Verifica la firma `X-Hub-Signature-256` de cada webhook. **En producción, sin esto el webhook rechaza.** |
| `META_WA_BASE_URL`        | Base versionada de la Graph API. Default `https://graph.facebook.com/v25.0`.                             |

Ninguna de estas sale jamás en una respuesta del API, ni al panel del admin.

### Telegram — solo desarrollo local

| Variable             | Descripción                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `MESSAGING_PROVIDER` | `whatsapp` (default y valor de producción) o `telegram`.                                                     |
| `TELEGRAM_BOT_TOKEN` | Solo local. Si está presente se carga el adaptador de Telegram; ausente, no. **No se define en producción.** |

Telegram existe porque Meta exige un webhook HTTPS público: probar el motor
conversacional en tu máquina requeriría un túnel y reconfigurar el webhook en
cada sesión. Telegram usa polling — token y listo. No está desplegado.

## Compose (Postgres del stack)

| Variable                                              | Descripción                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciales del contenedor `db`. `POSTGRES_PASSWORD` es obligatoria (el compose falla sin ella). |
