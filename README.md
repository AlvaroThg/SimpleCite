# SimpleCite

> SaaS multi-tenant de agenda, cobros e historia clínica para clínicas en Bolivia.

Para clínicas con **dos o más especialistas**: una sola vista de pacientes,
agenda, caja, inventario e historial, en vez de cinco procesos manuales sueltos.

## Stack

- **Backend**: NestJS 11 (TypeScript) — monolito modular, hexagonal
- **Frontend**: Next.js 15 (React 19) + Tailwind v4 + shadcn/ui
- **Base de datos**: PostgreSQL + Prisma 6
- **Storage**: Cloudflare R2 (logos, QR, fotos, galería)
- **Monorepo**: pnpm workspaces + Turborepo
- **Deploy**: Docker Compose sobre Dokploy

Cómo encajan las piezas: **[docs/architecture.md](docs/architecture.md)**.
Diseño: [PRODUCT.md](PRODUCT.md) y [DESIGN.md](DESIGN.md).

## Estructura

```
SimpleCite/
├── apps/
│   ├── api/                # NestJS (puerto 3001)
│   └── web/                # Next.js (puerto 3000)
├── packages/
│   ├── database/           # Prisma: schema, migraciones, seed, scripts
│   ├── shared/             # Zod schemas, tipos y reglas compartidas
│   └── config/             # Validación de env
└── docs/                   # architecture.md · env.md · rls-enforcement.md
```

## Setup local

### Prerrequisitos

- Node.js ≥ 22
- pnpm ≥ 10
- PostgreSQL 16 (local, Docker o gestionado)

### 1. Instalar

```bash
git clone https://github.com/AlvaroThg/SimpleCite.git
cd SimpleCite
pnpm install
```

### 2. Configurar el entorno

```bash
cp .env.example .env
```

Editá `.env`. El mínimo para arrancar:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/simplecite?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/simplecite?schema=public"
JWT_SECRET="<32+ caracteres aleatorios>"
PATIENT_JWT_SECRET="<32+ caracteres aleatorios, distinto del anterior>"
```

```bash
# genera dos secretos válidos
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

El API valida el entorno **al arrancar** (`apps/api/src/common/config/env.schema.ts`):
si falta algo obligatorio no levanta y dice exactamente qué variable es. La
referencia completa está en **[docs/env.md](docs/env.md)**.

### 3. Base de datos

```bash
pnpm db:bootstrap      # prepara roles/funciones RLS — SOLO en una DB nueva y vacía
pnpm db:generate       # Prisma Client
pnpm db:migrate:dev    # aplica migraciones
pnpm db:seed           # clínica demo + usuarios de prueba
```

> `db:bootstrap` va **antes** de las migraciones en una base recién creada: sin
> él, la migración de RLS falla porque `current_tenant_id` todavía no existe.

El seed deja una clínica `clinica-demo` con un usuario por rol. Las credenciales
las imprime `packages/database/prisma/seed.ts` al terminar.

### 4. Levantar

```bash
pnpm dev            # API + web
pnpm dev:api        # solo API   → http://localhost:3001/api
pnpm dev:web        # solo web   → http://localhost:3000
```

Rutas para probar:

| URL                                  | Qué es                         |
| ------------------------------------ | ------------------------------ |
| `http://localhost:3000`              | Landing de venta de SimpleCite |
| `http://localhost:3000/clinica-demo` | Landing pública de la clínica  |
| `http://localhost:3000/panel/login`  | Panel del staff                |
| `http://localhost:3001/api/health`   | Healthcheck del API            |

En dev el slug de la clínica va en el path; en producción sale del subdominio.

## Comandos

| Comando                      | Qué hace                              |
| ---------------------------- | ------------------------------------- |
| `pnpm dev`                   | API + web en watch                    |
| `pnpm build`                 | Build de todo (Turborepo)             |
| `pnpm lint`                  | ESLint en todos los paquetes          |
| `pnpm format`                | Prettier sobre el repo                |
| `pnpm --filter api test`     | Tests unitarios del API (Jest)        |
| `pnpm --filter api test:cov` | Tests con reporte de cobertura        |
| `pnpm db:studio`             | Prisma Studio                         |
| `pnpm tenant:new`            | Alta de una clínica nueva             |
| `pnpm tenant:renew`          | Renovar la suscripción de una clínica |

Antes de abrir un PR: `pnpm lint && pnpm format:check && pnpm build && pnpm --filter api test`
(es exactamente lo que corre CI).

## Multi-tenencia

Cada request resuelve su clínica en el `TenantMiddleware`, por orden de prioridad:

1. **Path público** `/api/public/tenants/:slug/...` — máxima prioridad, para que
   un header no pueda forzar otra clínica en una ruta sin auth.
2. Header `x-tenant-id` / `x-tenant-slug` (clientes API, Postman, la web).
3. Subdominio del `Host` (`clinica-demo.simplecite.com.bo`).

En rutas autenticadas **el `tenantId` del JWT gana sobre todo lo anterior**: el
`TenantGuard` lo reancla antes de validar el estado de la clínica.

El aislamiento efectivo es de capa de aplicación (`where: { tenantId }` en cada
query). RLS está escrito pero dormido — ver [docs/rls-enforcement.md](docs/rls-enforcement.md).

## Contribuir

[CONTRIBUTING.md](CONTRIBUTING.md) — ramas, commits y qué revisar antes de un PR.

## Licencia

Privado — todos los derechos reservados.
