# Arquitectura — SimpleCite

Mapa para orientarse antes de tocar código. Los detalles finos viven en los
comentarios de cabecera de cada módulo; esto es el plano general.

## Qué resuelve el producto

Clínicas bolivianas con **dos o más especialistas**. El problema no es "agendar
citas": es que pacientes, agenda, cobros, stock e historial viven en procesos
manuales desconectados. El comprador es el director clínico, que quiere una
vista agregada sin meterse en el detalle operativo.

Eso fija dos ejes de aislamiento que atraviesan todo el código:

| Eje                  | Entre qué                    | Cómo se aplica                                 |
| -------------------- | ---------------------------- | ---------------------------------------------- |
| **Tenant**           | Clínica A ↔ Clínica B        | `where: { tenantId }` explícito en cada query  |
| **Doctor (scoping)** | Dr. A ↔ Dr. B, misma clínica | `requester` del JWT validado en el **service** |

El segundo es el que se olvida. Ver ["Doctor scoping"](#doctor-scoping).

## Piezas

```
SimpleCite/
├── apps/
│   ├── api/                # NestJS — toda la lógica de negocio y el acceso a datos
│   └── web/                # Next.js 15 — landing pública por clínica + panel del staff
├── packages/
│   ├── database/           # Prisma: schema, migraciones, seed, scripts de tenant
│   └── shared/             # Zod schemas + tipos + reglas que los DOS lados necesitan
└── docs/                   # Esto, env.md, rls-enforcement.md
```

**Regla de dependencias:** `apps/*` dependen de `packages/*`; nunca al revés, y
las apps no se importan entre sí. Lo que necesiten ambas (schemas de validación,
enums, la máquina de estados de la cita) va a `packages/shared` — si se duplica,
un cambio en un lado deja el otro desincronizado sin que nada falle.

## apps/api — monolito modular, hexagonal

Un módulo Nest por área de negocio, todos con la misma forma:

```
modules/<area>/
├── <area>.module.ts
├── application/services/    # lógica de negocio + acceso a Prisma
└── infrastructure/adapters/ # controllers (HTTP)
    └── guards/ strategies/  # solo si el módulo trae los suyos
```

- El **controller** traduce HTTP → llamada al service. Valida el body con
  `ZodValidationPipe` y saca la identidad del JWT (`@CurrentUser`). Nada más.
- El **service** tiene las reglas, hace las queries y **aplica el control de
  acceso**. Es el único punto por el que pasan todas las llamadas (panel, bot,
  cron), así que la garantía tiene que vivir ahí.

`tenant` es el único módulo con `domain/ports/` — quedó de la plantilla
hexagonal original. No es el patrón vigente: los demás van directo a Prisma
desde el service, y está bien así mientras no aparezca un segundo backend.

### Cadena de una request

```
TenantMiddleware        resuelve tenantId (path público > header > subdominio)
      ↓
HttpThrottlerGuard      rate limit por IP (salta contextos no-HTTP)
JwtAuthGuard            valida el Bearer/cookie → request.user      [salta con @Public()]
TenantGuard             reancla tenantId al JWT y valida que la clínica no esté suspendida
RolesGuard              RBAC de @Roles(...)
SubscriptionGuard       402 si la suscripción venció        [solo donde se aplica a mano]
      ↓
TenantContextInterceptor  abre la tx con set_config si RLS_ENFORCED=true
      ↓
Controller → Service → Prisma
```

Los cuatro primeros guards son **globales** (`APP_GUARD` en `app.module.ts`):
cubren todos los endpoints sin declararlos uno por uno. `SubscriptionGuard` no
es global a propósito — se aplica con `@UseGuards()` sobre lo que se bloquea al
vencer el pago (citas, historia clínica, inventario, booking público), y se deja
fuera de login, `/billing/status` y `/health` para que una clínica vencida pueda
entrar y ver por qué no funciona.

### Multi-tenancy

`RLS_ENFORCED=false` por defecto: las políticas RLS de Postgres están escritas
pero **dormidas** (el rol de conexión las bypasea). El aislamiento real es de
capa de aplicación: cada query filtra por `tenantId`. Ver
[rls-enforcement.md](rls-enforcement.md).

Consecuencia práctica: **una query sin `where: { tenantId }` no la ataja nadie.**

### Doctor scoping

Que dos especialistas compartan clínica no significa que compartan datos. El
patrón, en el service:

```ts
assertOwnDoctor(requester, recurso.doctorId, 'reprogramar');
// requester sale del JWT. Un DOCTOR solo opera sobre lo suyo;
// ADMIN y STAFF sí orquestan toda la clínica.
```

Dónde aplica hoy: `appointments` (crear, ver, transicionar, reprogramar,
marcar pagado), `schedule` (reglas y bloqueos), `medical-records`,
`prescriptions`, `products` (los privados del doctor).

Cuando el controller además calcula el scope para un listado
(`effectiveDoctorId = user.sub`), eso es defensa en profundidad — **no**
reemplaza la validación del service. Un controller que filtra sobre un service
que ignora el filtro sigue siendo una brecha.

La regresión está cubierta en
`modules/appointments/application/services/doctor-scoping.spec.ts`.

### Validación

Todo con **Zod**, nunca con `class-validator`. No hay `ValidationPipe` global:
se aplica `new ZodValidationPipe(Schema)` explícitamente en cada `@Body()` y
`@Query()`. Los schemas viven en `packages/shared/src/schemas` para que el
frontend valide con exactamente los mismos.

## apps/web — Next.js App Router

```
src/
├── app/
│   ├── [slug]/      # landing + booking público de cada clínica (SSR, móvil primero)
│   ├── panel/       # panel del staff (client-side, JWT en cookie httpOnly)
│   ├── citas/       # cancelación por magic link (sin auth, el token es el secreto)
│   └── page.tsx     # landing de venta de SimpleCite
├── components/
│   ├── ui/          # primitivas shadcn
│   ├── panel/       # compartido del panel
│   ├── landing/     # compartido de la landing
│   └── calendar/    # calendario del panel y del booking
└── lib/             # clientes de API, formateo, helpers puros
```

`middleware.ts` resuelve el subdominio (`clinica-x.simplecite.com.bo`) y
reescribe a `/clinica-x/...`. En dev el slug va en el path.

**Dos clientes de API separados a propósito:** `lib/api.ts` (público, sin auth)
y `lib/panel-api.ts` (staff, con cookie + `x-tenant-slug`). No los mezcles: el
público se ejecuta en SSR para visitantes anónimos.

## Autenticación

Dos identidades de usuario, con secretos distintos:

| Quién           | Secreto              | Dónde viaja                         | Vida                            |
| --------------- | -------------------- | ----------------------------------- | ------------------------------- |
| Staff del panel | `JWT_SECRET`         | Cookie `httpOnly` (+ Bearer p/ CLI) | 12h, o 30d con sesión extendida |
| Paciente (OTP)  | `PATIENT_JWT_SECRET` | Bearer del wizard de booking        | 30m                             |

No hay refresh token. El panel usa una **sesión deslizante**
(`RollingSessionInterceptor`): la actividad renueva la cookie, así que un
usuario trabajando no se cae, y uno inactivo expira.

El webhook entrante de Meta se autentica distinto: firma HMAC
`X-Hub-Signature-256` sobre el cuerpo crudo, con `META_WA_APP_SECRET`. En
producción, sin app secret el webhook **rechaza** en vez de confiar.

## Mensajería

`MESSAGING_SERVICE` es un puerto (`messaging.port.ts`) con dos adaptadores:

| Adaptador          | Dónde                 | Por qué                                                                                                                                                  |
| ------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WhatsApp Cloud** | Producción            | Canal real. Un único número oficial de la plataforma (Meta), no uno por clínica.                                                                         |
| **Telegram**       | Solo desarrollo local | Meta exige un webhook HTTPS público: probar el bot en tu máquina pediría túnel + reconfigurar el webhook cada vez. Telegram es polling. No se despliega. |

El adaptador activo sale de `MESSAGING_PROVIDER`; Telegram además solo se carga
si existe `TELEGRAM_BOT_TOKEN`, que **no se define en producción**.

El `ConversationEngine` es único y no sabe por qué canal llegó el mensaje: los
adaptadores traducen a `BotInbound` y renderizan los `BotOutbound`. Todos los
envíos son **best-effort** — un fallo de mensajería nunca tumba la operación de
negocio.

> **Baileys (histórico).** Hubo un orquestador que levantaba un contenedor de
> WhatsApp por clínica (`apps/whatsapp-instance` + `modules/whatsapp`), manejado
> vía el socket de Docker. Se eliminó: exigía montar `/var/run/docker.sock` en
> el API y nunca llegó a desplegarse. Sus tablas (`whatsapp_instances`,
> `whatsapp_messages`, `wa_conversations`) siguen en el schema marcadas como
> LEGACY, sin código que las use.

## Qué está apagado en `main`

- `PUBLIC_BOOKING_REQUIRE_OTP=false` → booking abierto con Turnstile + rate
  limit por teléfono, en vez de OTP.
- `RLS_ENFORCED=false` → RLS dormido.

Son flags: el código del otro camino sigue vivo y probado.
