# syntax=docker/dockerfile:1.7
# =====================================================================
# SimpleCite Web (Next.js 15) — Dockerfile multi-stage para monorepo
# =====================================================================
# Misma estrategia que el Dockerfile de la API (turbo prune + standalone).
# Requiere `output: 'standalone'` en next.config.ts.
#
# IMPORTANTE: las variables NEXT_PUBLIC_* se INLINEAN en build, así que deben
# pasarse como --build-arg al construir (en Dokploy: Build Args).
# =====================================================================

ARG NODE_VERSION=20-alpine
ARG PNPM_VERSION=10.33.2
ARG TURBO_VERSION=2.5.4

# ─── base ────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libc6-compat
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

# ─── pruner: subgrafo de la web ──────────────────────────────────────
FROM base AS pruner
ARG TURBO_VERSION
RUN npm install -g turbo@${TURBO_VERSION}
COPY . .
RUN turbo prune web --docker

# ─── builder: instala deps + compila Next ────────────────────────────
FROM base AS builder
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ ./
# tsconfig base referenciado por los packages vía extends.
COPY tsconfig.base.json ./tsconfig.base.json

# Variables públicas (se inlinean en el bundle del cliente).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# Site key de Cloudflare Turnstile (anti-bot del booking). Vacío = widget oculto
# y el backend trata el check como no-op.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}

# Deep links al bot de reservas (t.me/... o wa.me/...). Vacío = sin CTAs de chat.
ARG NEXT_PUBLIC_BOT_URL
ENV NEXT_PUBLIC_BOT_URL=${NEXT_PUBLIC_BOT_URL}
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_KEY}

RUN pnpm turbo run build --filter=web

# ─── runner: imagen final (standalone) ───────────────────────────────
FROM base AS runner
RUN apk add --no-cache tini
ENV NODE_ENV=production
USER node

# El bundle standalone reproduce el árbol del monorepo: apps/web/server.js +
# node_modules mínimos. static y public se copian aparte (Next no los incluye).
COPY --chown=node:node --from=builder /app/apps/web/.next/standalone ./
COPY --chown=node:node --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=node:node --from=builder /app/apps/web/public ./apps/web/public

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
