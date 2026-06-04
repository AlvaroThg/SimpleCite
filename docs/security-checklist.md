# Checklist de seguridad — SimpleCite (OWASP + verificación)

Estado de las pruebas ejecutadas contra el API (entorno dev). ✅ = verificado.

## Resultados de probes

| #   | Vector               | Prueba                                  | Resultado                                    |
| --- | -------------------- | --------------------------------------- | -------------------------------------------- |
| A   | **Auth bypass**      | `GET /patients` sin token               | ✅ 401                                       |
| B   | **JWT tampering**    | Token con firma alterada (`role:ADMIN`) | ✅ 401 (firma inválida)                      |
| C   | **SQLi (path)**      | slug = `clinica-demo' OR '1'='1`        | ✅ 404, sin 500 ni leak (Prisma parametriza) |
| D   | **SQLi (query)**     | `?q='; DROP TABLE patients;--`          | ✅ 401 (auth primero); Prisma parametriza    |
| E   | **Input validation** | OTP con phone inválido                  | ✅ 400 (Zod)                                 |
| F   | **IDOR**             | Token de paciente A confirma cita de B  | ✅ 403 (phone del JWT ≠ phone de la cita)    |
| G   | **User enumeration** | Slug inexistente                        | ✅ 404 genérico                              |
| H   | **Cross-tenant**     | Admin tenant B lee paciente de tenant A | ✅ 404 (filtro `where:{tenantId}`)           |
| I   | **Cross-role (EHR)** | Staff lee notas clínicas                | ✅ `clinicalAccess:false`, 0 notas           |
| J   | **PII en logs**      | Password en login                       | ✅ redactado (0 apariciones)                 |

## Controles implementados (OWASP Top 10)

- **A01 Broken Access Control**:
  - RBAC por `@Roles()` + guards globales (Jwt → Tenant → Roles).
  - Aislamiento multi-tenant: TODA query incluye `where:{tenantId}` (tenantId del
    JWT, no spoofeable). RLS dormante listo para activar (ver `rls-enforcement.md`).
  - EHR: acceso a notas por rol (author/doctor-asignado/admin; staff no).
  - IDOR: validación de pertenencia (phone del paciente, tenant de la cita).
- **A02 Cryptographic Failures**: passwords y OTP con bcrypt; JWT firmado (secrets
  ≥32 chars, separados para staff y paciente); webhook con HMAC-SHA256.
- **A03 Injection**: Prisma ORM (queries parametrizadas) + validación Zod en todo
  input. Sin SQL crudo con interpolación de input de usuario.
- **A04 Insecure Design**: máquina de estados de citas, idempotencia de pagos,
  rate limiting de OTP (DB-backed por phone + IP).
- **A05 Security Misconfiguration**: CORS restringido por entorno; Turnstile
  opcional en endpoints públicos; `assertProductionInvariants` exige secrets en prod.
- **A07 Auth Failures**: rate limit OTP (3/h por phone, 30/h por IP), lock de 5
  intentos por OTP, expiración de OTP (10 min) y de sesión de paciente (30 min).
- **A09 Logging Failures**: Pino estructurado con `redact` de `authorization` y
  `password`; contexto tenant/user por request; eventos de seguridad logueados
  (otp.ratelimit, turnstile.rejected, webhook.bad-signature, etc.).

## Pendientes / hardening recomendado (post-MVP)

- [ ] Activar RLS real (rol sin bypassrls) — ver `docs/rls-enforcement.md`.
- [ ] WAF en Cloudflare para `/webhooks/*` y `/public/*` — ver `docs/cloudflare.md`.
- [ ] Rotación periódica de `JWT_SECRET` / `PATIENT_JWT_SECRET` (runbook).
- [ ] Fuzzing automatizado (ej. schemathesis) en CI contra el OpenAPI.
- [ ] Escaneo de dependencias (`pnpm audit` / Dependabot) en el pipeline.
- [ ] Pentest externo antes de manejar volumen real de datos clínicos.

## Cómo re-ejecutar las probes

Con el API corriendo (`docker compose up -d`), los comandos de las probes A–J
están en el historial de la Fase 8; se pueden reconstruir con `curl`/Python
apuntando a `http://localhost:3001/api`. Para CI, considerar moverlas a un
job de integración con DB efímera.
