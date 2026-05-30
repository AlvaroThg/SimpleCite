# =====================================================================
# SimpleCite WhatsApp Instance — Imagen para contenedores Baileys
# =====================================================================
# Una instancia por tenant. Creada/destruida dinámicamente por el
# InstanceManagerService del NestJS API.
#
# Sin Chromium (Baileys usa la API multi-device de WhatsApp Web puro).
# Imagen resultante: ~200MB vs ~800MB de whatsapp-web.js.
# =====================================================================

FROM node:20-alpine AS base

# Dependencias de sistema que Baileys puede necesitar para criptografía
# (libssl para operaciones TLS nativas del módulo de auth)
RUN apk add --no-cache openssl

WORKDIR /app

# ─── Instalar dependencias ────────────────────────────────────────────
COPY package.json ./
# No hay lockfile propio — usamos npm ci con el package.json directo.
# En producción el InstanceManager construye la imagen una sola vez.
RUN npm install --omit=dev --no-package-lock

# ─── Código fuente ────────────────────────────────────────────────────
COPY src/ ./src/

# ─── Usuario no-root ──────────────────────────────────────────────────
# La sesión de WhatsApp se persiste en /session (volumen externo).
# El directorio debe ser escribible por el usuario node (uid 1000).
RUN mkdir -p /session && chown -R node:node /session /app
USER node

# ─── Variables de entorno por defecto ────────────────────────────────
ENV NODE_ENV=production
ENV PORT=4000
ENV SESSION_DIR=/session
ENV LOG_LEVEL=warn

EXPOSE 4000

# Volumen para la sesión de WhatsApp Web (creds, keys, store)
VOLUME ["/session"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "src/index.mjs"]
