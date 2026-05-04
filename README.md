# SimpleCite

> SaaS Multi-tenant para la gestión de consultorios médicos y clínicas en Bolivia.

## 🏗 Arquitectura

- **Backend**: NestJS (TypeScript) — Monolito Modular con Arquitectura Hexagonal
- **Frontend**: Next.js 15 (React 19) + Tailwind CSS 4
- **Base de Datos**: PostgreSQL (Supabase) + Prisma ORM
- **Multi-tenencia**: `tenant_id` por fila + Row-Level Security (RLS)
- **Monorepo**: pnpm workspaces + Turborepo

## 📁 Estructura

```
SimpleCite/
├── apps/
│   ├── api/          # NestJS API (puerto 3001)
│   └── web/          # Next.js Frontend (puerto 3000)
├── packages/
│   ├── database/     # Prisma schema, migraciones, seed, RLS
│   ├── shared/       # DTOs, Zod schemas, tipos compartidos
│   └── config/       # Validación de env vars (Zod)
└── .github/workflows # CI/CD
```

## 🚀 Setup

### Prerrequisitos

- Node.js ≥ 22
- pnpm ≥ 10
- Proyecto en Supabase

### Instalación

```bash
# 1. Clonar
git clone https://github.com/AlvaroThg/SimpleCite.git
cd SimpleCite

# 2. Instalar dependencias
pnpm install

# 3. Configurar entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase

# 4. Generar Prisma Client
pnpm db:generate

# 5. Ejecutar migraciones
pnpm db:migrate:dev

# 6. Seed de datos demo
pnpm db:seed
```

### Desarrollo

```bash
# Levantar todo
pnpm dev

# Solo API
pnpm dev:api

# Solo Web
pnpm dev:web

# Prisma Studio
pnpm db:studio
```

## 🔐 Multi-tenencia

Cada request pasa por el `TenantMiddleware` que resuelve el tenant por:
1. Header `X-Tenant-ID`
2. Subdominio del `Host` (ej: `clinica-demo.simplecite.com.bo`)
3. JWT claim `tenant_id`

## 📋 Licencia

Privado — Todos los derechos reservados.