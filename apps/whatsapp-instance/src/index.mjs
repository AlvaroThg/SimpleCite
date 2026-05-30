/**
 * SimpleCite WhatsApp Instance — Baileys HTTP wrapper
 *
 * Un proceso Node por tenant. Mantiene una conexión WhatsApp Web multi-device
 * usando Baileys (sin Chromium). Expone una API HTTP para:
 *   GET  /health    — estado actual y uptime
 *   GET  /status    — estado de conexión y número vinculado
 *   GET  /qr        — SSE stream: QR codes durante pairing, evento "connected" al conectar
 *   POST /send      — enviar mensaje con idempotencia por messageKey
 *   POST /disconnect — cerrar sesión y borrar auth
 *
 * Variables de entorno:
 *   PORT           — puerto HTTP (default: 4000)
 *   TENANT_ID      — tenantId de la clínica (usado en logs y webhooks)
 *   SESSION_DIR    — directorio donde Baileys persiste la sesión (default: /session)
 *   WEBHOOK_URL    — URL del orquestador NestJS para notificar eventos de conexión
 *   INTERNAL_SECRET — secret compartido para validar llamadas desde el orquestador
 *   LOG_LEVEL      — nivel de log pino (default: warn)
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import express from 'express';
import pino from 'pino';
import qrcode from 'qrcode';

const PORT          = parseInt(process.env.PORT ?? '4000', 10);
const TENANT_ID     = process.env.TENANT_ID ?? 'unknown';
const SESSION_DIR   = process.env.SESSION_DIR ?? '/session';
const WEBHOOK_URL   = process.env.WEBHOOK_URL;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
const LOG_LEVEL     = process.env.LOG_LEVEL ?? 'warn';

const logger = pino({
  level: LOG_LEVEL,
  formatters: { level: (label) => ({ level: label }) },
});

const app = express();
app.use(express.json());

// ─── Estado global ──────────────────────────────────────────────────

let sock = null;
let qrString = null;          // raw QR string de Baileys
let qrDataUrl = null;         // QR como data:image/png;base64,...
let instanceStatus = 'disconnected';
let boundPhone = null;
let startedAt = Date.now();
const sseClients = new Set();

// ─── Helpers ─────────────────────────────────────────────────────────

function broadcast(data) {
  const line = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(line); } catch (_) {}
  }
}

async function notifyWebhook(payload) {
  if (!WEBHOOK_URL) return;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (INTERNAL_SECRET) headers['x-internal-secret'] = INTERNAL_SECRET;
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tenantId: TENANT_ID, ...payload }),
    });
  } catch (err) {
    // webhook failures no deben crashear la instancia
    logger.warn({ event: 'webhook.failed', err: err.message }, 'notifyWebhook');
  }
}

// ─── Conexión Baileys ─────────────────────────────────────────────────

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    logger: pino({ level: 'silent' }),  // Baileys es muy verboso; silenciamos internamente
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60_000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrString = qr;
      instanceStatus = 'pairing';
      try {
        qrDataUrl = await qrcode.toDataURL(qr);
      } catch {
        qrDataUrl = null;
      }
      broadcast({ type: 'qr', qr: qrDataUrl ?? qrString });
      await notifyWebhook({ event: 'qr' });
      logger.info({ event: 'qr.generated', tenantId: TENANT_ID }, 'qr ready');
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      qrString = null;
      qrDataUrl = null;
      boundPhone = null;
      instanceStatus = loggedOut ? 'logged_out' : 'disconnected';

      broadcast({ type: instanceStatus });
      await notifyWebhook({ event: 'disconnected', reason: instanceStatus });
      logger.info({ event: 'connection.close', reason: instanceStatus, statusCode }, 'connection closed');

      if (!loggedOut) {
        // Reconectar con back-off fijo de 5 segundos
        setTimeout(startSocket, 5_000);
      }
    }

    if (connection === 'open') {
      qrString = null;
      qrDataUrl = null;
      instanceStatus = 'connected';
      boundPhone = sock.user?.id?.split(':')[0] ?? null;

      broadcast({ type: 'connected', phone: boundPhone });
      await notifyWebhook({ event: 'connected', phone: boundPhone });
      logger.info({ event: 'connection.open', phone: boundPhone }, 'connected to WhatsApp');
    }
  });
}

// ─── Middleware de autenticación interna ─────────────────────────────

function requireInternalSecret(req, res, next) {
  if (!INTERNAL_SECRET) { next(); return; }  // no configurado → allow (dev)
  if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// ─── HTTP Endpoints ───────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: instanceStatus,
    phone: boundPhone,
    tenantId: TENANT_ID,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  });
});

app.get('/status', (_req, res) => {
  res.json({ status: instanceStatus, phone: boundPhone });
});

/**
 * SSE stream de QR.
 * Emite inmediatamente el estado actual y luego pushea cambios en tiempo real.
 * El cliente (panel admin via proxy NestJS) debe desconectar cuando reciba "connected".
 */
app.get('/qr', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Estado actual inmediato
  if (instanceStatus === 'connected') {
    res.write(`data: ${JSON.stringify({ type: 'connected', phone: boundPhone })}\n\n`);
  } else if (qrDataUrl || qrString) {
    res.write(`data: ${JSON.stringify({ type: 'qr', qr: qrDataUrl ?? qrString })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ type: instanceStatus })}\n\n`);
  }

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));

  // Heartbeat cada 25s para mantener la conexión viva
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25_000);
  req.on('close', () => clearInterval(heartbeat));
});

/**
 * Enviar mensaje de WhatsApp.
 * Body: { phone: "59170000000", text: "...", messageKey: "unique-key" }
 * Idempotencia: el caller debe usar la misma messageKey para reintentos.
 * La idempotencia real se maneja en el orquestador (NestJS WaMessageService).
 */
app.post('/send', requireInternalSecret, async (req, res) => {
  const { phone, text, messageKey } = req.body ?? {};

  if (!phone || !text) {
    return res.status(400).json({ error: 'phone and text are required' });
  }

  if (instanceStatus !== 'connected') {
    return res.status(503).json({ error: 'not connected', status: instanceStatus });
  }

  try {
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
    const result = await sock.sendMessage(jid, { text });
    logger.info({ event: 'message.sent', phone, messageKey }, 'message sent');
    return res.json({ success: true, messageId: result?.key?.id, messageKey });
  } catch (err) {
    logger.error({ event: 'message.error', phone, err: err.message }, 'send failed');
    return res.status(500).json({ error: err.message, messageKey });
  }
});

/**
 * Desconectar y limpiar la sesión (logout de WhatsApp).
 * Después de esto el contenedor puede ser detenido por el orquestador.
 */
app.post('/disconnect', requireInternalSecret, async (_req, res) => {
  try {
    if (sock) {
      await sock.logout();
    }
    instanceStatus = 'disconnected';
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Arranque ─────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info({ event: 'server.start', port: PORT, tenantId: TENANT_ID }, 'wa-instance started');
  console.log(JSON.stringify({ event: 'server.start', port: PORT, tenantId: TENANT_ID }));
});

startSocket().catch((err) => {
  logger.error({ event: 'socket.init.error', err: err.message }, 'failed to init Baileys socket');
  process.exit(1);
});
