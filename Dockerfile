# syntax=docker/dockerfile:1.7
# =====================================================================
# SimpleCite API — Dockerfile multi-stage para NestJS en monorepo
# =====================================================================
# Estrategia:
#   1. base    — Node 20 Alpine + pnpm + libs comunes (openssl para Prisma)
#   2. pruner  — turbo prune genera un sparse monorepo con solo lo que
#                la API necesita (mejor caché y menor superficie de copia)
#   3. builder — instala deps con cache layer + genera Prisma client
#                (binario musl) + compila TS → JS
#   4. runner  — imagen final liviana, no-root, con tini para señales
#
# El runner contiene un monorepo completo (no se hace pnpm prune --prod)
# porque pnpm + workspaces + binarios nativos compilados (bcrypt) +
# Prisma generated client hacen que una reinstalación prod-only complique
# más de lo que ahorra. Trade-off documentado.
# =====================================================================

ARG NODE_VERSION=20-alpine
ARG PNPM_VERSION=10.33.2
ARG TURBO_VERSION=2.5.4

# ─── base ────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS base

# openssl  → Prisma query engine lo enlaza en runtime
# libc6-compat → shim para algunos binarios glibc-only en Alpine (musl)
RUN apk add --no-cache libc6-compat openssl

# Activar pnpm vía corepack (incluido en Node 16+)
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# ─── pruner: turbo prune para subgrafo de la API ─────────────────────
FROM base AS pruner

ARG TURBO_VERSION
RUN npm install -g turbo@${TURBO_VERSION}

# .dockerignore ya filtra node_modules, dist, .git, .env*, etc.
COPY . .

# Output:
#   /app/out/json/         → solo package.json (capa cacheable)
#   /app/out/full/         → código fuente del subgrafo
#   /app/out/pnpm-lock.yaml → lockfile pruned
RUN turbo prune api --docker

# ─── builder: instala deps + genera Prisma + compila ─────────────────
FROM base AS builder

# Toolchain para módulos nativos (bcrypt usa node-gyp)
RUN apk add --no-cache python3 make g++

# Capa 1: instalar dependencias usando solo metadata (mejor caché)
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
# El postinstall de @simplecite/database invoca `prisma generate`, así que
# el schema.prisma debe estar presente ANTES del install. La carpeta prisma/
# (schema + migraciones) cambia raramente, así que sigue siendo buena caché.
COPY --from=pruner /app/out/full/packages/database/prisma ./packages/database/prisma
RUN pnpm install --frozen-lockfile

# Capa 2: traer el código fuente
COPY --from=pruner /app/out/full/ ./

# `turbo prune --docker` no incluye archivos del root del monorepo más allá
# de package.json/lockfile/turbo.json. Los tsconfig base se referencian
# desde packages/*/tsconfig.json vía `extends: "../../tsconfig.base.json"`,
# así que hay que traerlos manualmente.
COPY tsconfig.base.json ./tsconfig.base.json

# Re-generar Prisma client tras copiar todo (no-op si ya está actualizado,
# pero garantiza que el binario musl esté en su sitio definitivo).
RUN pnpm --filter @simplecite/database exec prisma generate

# Compilar la API (turbo construye también packages transitivos: config,
# database, shared) respetando turbo.json
RUN pnpm turbo run build --filter=api

# ─── runner: imagen final ────────────────────────────────────────────
FROM base AS runner

# tini = init liviano que maneja SIGTERM/SIGINT correctamente y reapa
# procesos zombi. Crítico para que `docker stop` no tarde 10s.
RUN apk add --no-cache tini

# Usuario no-root (el node:alpine ya incluye uno con uid 1000, lo reusamos)
USER node

# Copiar el monorepo construido del builder
COPY --chown=node:node --from=builder /app ./

ENV NODE_ENV=production

# Workdir final: el cwd de la API, así `node dist/main.js` resuelve relativo
WORKDIR /app/apps/api

EXPOSE 3001

# tini como PID 1 para señales limpias
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
