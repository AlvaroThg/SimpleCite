# Documentación operativa — SimpleCite

Índice de la documentación de operación, deploy y seguridad (Fase 8).

| Documento                                        | Contenido                                                                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| [deploy-vps.md](./deploy-vps.md)                 | Provisión del VPS (Hetzner/DO), Docker, Traefik, healthchecks, backups, actualizaciones                                                 |
| [runbook.md](./runbook.md)                       | Rotación de secretos, alta de tenants, recuperación WhatsApp, replay de webhooks, backups, **checklist de release y criterios go-live** |
| [cloudflare.md](./cloudflare.md)                 | DNS wildcard, SSL Full strict, WAF, rate limits por ruta, Turnstile/Bot Fight                                                           |
| [security-checklist.md](./security-checklist.md) | Resultados de las probes (SQLi, JWT, IDOR, auth bypass, cross-tenant/role, PII) + mapeo OWASP Top 10                                    |
| [rls-enforcement.md](./rls-enforcement.md)       | Estado del RLS (listo pero no activado) y pasos para el flip a enforcement real                                                         |

## Artefactos de infraestructura

| Archivo                                        | Uso                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `Dockerfile`                                   | Imagen del API (NestJS, multi-stage)                                           |
| `apps/whatsapp-instance/Dockerfile`            | Imagen de las instancias Baileys                                               |
| `docker-compose.yml`                           | Desarrollo local (API + red interna)                                           |
| `docker-compose.prod.yml`                      | Producción (Traefik + API + TLS)                                               |
| `.github/workflows/ci.yml`                     | CI: lint, format, **tests**, build, db-validate, build/push de imágenes a GHCR |
| `packages/database/scripts/setup-rls-role.sql` | Setup del rol sin bypassrls (para activar RLS real)                            |

## Resumen del MVP

SimpleCite es un SaaS multi-tenant para clínicas en Bolivia:

- **Booking público**: landing por tenant → wizard (doctor → servicio → slot →
  OTP por WhatsApp → pago QR Simple → confirmación).
- **WhatsApp**: una instancia Baileys por tenant (orquestada vía Docker socket),
  OTP real y bot conversacional de agendado.
- **Pagos**: QR Simple con webhook idempotente firmado (HMAC) y conciliación cron.
- **Panel profesional** (`/panel`): staff/doctor — citas, pacientes, historial
  clínico (EHR) con control de acceso por rol y editor de notas Markdown.
- **Multi-tenancy**: aislamiento por `tenantId` en cada query (app-layer); RLS
  preparado para enforcement real.
