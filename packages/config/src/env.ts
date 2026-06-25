import { z } from 'zod';

/**
 * Schema de validación para las variables de entorno de SimpleCite.
 * Se valida en runtime al iniciar cualquier app del monorepo (api/web).
 *
 * Si necesitas agregar una variable, hazlo aquí Y en los archivos
 * `.env.{development,test,production}.example`.
 */
export const envSchema = z.object({
  // ─── Database (Supabase PostgreSQL) ───
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL es requerida (para Prisma migrate)').optional(),

  // ─── Supabase (legacy — opcional tras migrar a R2 + Postgres propio) ───
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // ─── Cloudflare R2 (almacenamiento de archivos) ───
  // El endpoint puede pasarse explícito (R2_ENDPOINT) o derivarse de R2_ACCOUNT_ID.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  // URL pública del bucket (subdominio r2.dev o dominio propio conectado).
  R2_PUBLIC_URL: z.string().url().optional(),

  // ─── JWT propio (NestJS firma) ───
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRATION: z.string().default('24h'),

  // ─── App ───
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  APP_DOMAIN: z.string().default('simplecite.com.bo'),

  // ─── RLS enforcement ───
  // false (default): RLS dormante — el aislamiento lo da el filtro app-layer
  //   `where:{tenantId}` y NO se abre transacción por request (menos latencia).
  // true: activa el enforcement real — requiere el rol sin bypassrls y abre una
  //   transacción con set_config por request (ver docs/rls-enforcement.md).
  RLS_ENFORCED: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .default(false),

  // ─── QR Simple (pasarela de pagos Bolivia) ───
  QR_SIMPLE_API_URL: z.string().url().optional(),
  QR_SIMPLE_API_KEY: z.string().optional(),
  QR_SIMPLE_WEBHOOK_SECRET: z
    .string()
    .min(16, 'QR_SIMPLE_WEBHOOK_SECRET debe tener al menos 16 caracteres')
    .optional(),

  // ─── PayPal (suscripciones recurrentes) ───
  // En dev/test apunta SIEMPRE al entorno Sandbox. Cambiar a
  // https://api-m.paypal.com solo en producción con credenciales live.
  PAYPAL_API_BASE: z.string().url().default('https://api-m.sandbox.paypal.com'),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  // ID del webhook configurado en el dashboard de PayPal — requerido para
  // verificar la firma de los webhooks entrantes.
  PAYPAL_WEBHOOK_ID: z.string().optional(),

  // ─── WhatsApp Instance Manager (Fase 5) ───
  // Red Docker donde viven los contenedores Baileys (uno por tenant).
  WA_DOCKER_NETWORK: z.string().default('simplecite-internal'),
  // URL que los contenedores usan para postear webhooks al NestJS API.
  // En Docker: http://simplecite-api:3001 (nombre del container en la red interna).
  // En dev local: http://host.docker.internal:3001
  WA_CALLBACK_URL: z.string().default('http://simplecite-api:3001/api/internal/whatsapp/webhook'),
  // Secret compartido entre API y contenedores Baileys. Mínimo 16 chars en prod.
  WA_INTERNAL_SECRET: z.string().default(''),
  // Imagen Docker de la instancia Baileys (debe estar disponible en el daemon).
  WA_INSTANCE_IMAGE: z.string().default('simplecite-wa-instance:latest'),
  // Obsoleto tras Fase 5 — mantenemos para no romper envs existentes.
  WHATSAPP_ORCHESTRATOR_URL: z.string().url().optional(),
  WHATSAPP_ORCHESTRATOR_TOKEN: z.string().optional(),

  // ─── WhatsApp Cloud API (Meta — bot centralizado oficial) ───
  // Modelo "bot centralizado": un único número oficial de la plataforma.
  // Base de la Graph API (versionada). Cambiar la versión aquí, no en el código.
  META_WA_BASE_URL: z.string().url().default('https://graph.facebook.com/v19.0'),
  // Phone Number ID del número de WhatsApp Business (NO el número en sí).
  META_WA_PHONE_NUMBER_ID: z.string().optional(),
  // Token de acceso permanente (System User) para llamar a la Graph API.
  META_WA_ACCESS_TOKEN: z.string().optional(),
  // Token propio que Meta repite en la verificación GET del webhook.
  META_WA_VERIFY_TOKEN: z.string().optional(),
  // App Secret de la app de Meta — verifica la firma X-Hub-Signature-256 de
  // los webhooks entrantes. Si está vacío, la firma NO se verifica (solo dev).
  META_WA_APP_SECRET: z.string().optional(),
  // URL pública del frontend (web) para construir enlaces dirigidos al paciente,
  // p.ej. el magic link de cancelación. Sin slash final.
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:3000'),

  // ─── Mensajería al paciente (Ports & Adapters) ───
  // Canal saliente activo. 'telegram' (pruebas MVP) o 'whatsapp' (producción).
  // Si no se setea: telegram cuando hay TELEGRAM_BOT_TOKEN, si no whatsapp.
  MESSAGING_PROVIDER: z.enum(['telegram', 'whatsapp']).optional(),
  // Token del bot de Telegram (BotFather). Necesario para el adaptador Telegram.
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // ─── Cloudflare (tunneling / DNS de subdominios) ───
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),

  // ─── Cloudflare Turnstile (bot protection en endpoints públicos) ───
  // Si TURNSTILE_SECRET_KEY no está seteada, la verificación se omite
  // (modo dev). En prod debería estar presente — ver assertProductionInvariants.
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // ─── Patient OTP / Sesión de paciente ───
  // Secret separado del JWT_SECRET de admin/staff/doctor para reducir el
  // blast radius si uno se filtra. La sesión del paciente vive solo durante
  // el flujo de booking.
  PATIENT_JWT_SECRET: z.string().min(32, 'PATIENT_JWT_SECRET debe tener al menos 32 caracteres'),
  PATIENT_SESSION_TTL: z.string().default('30m'),
  // Duración del OTP en minutos
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  // Duración de la cita TENTATIVE antes de auto-cancelarse (minutos)
  TENTATIVE_APPOINTMENT_TTL_MINUTES: z.coerce.number().int().positive().default(15),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Reglas que aplican solo en producción (sobre el resultado ya parseado).
 * Lanza si falta una variable que es opcional en dev pero requerida en prod.
 */
function assertProductionInvariants(env: Env): void {
  if (env.NODE_ENV !== 'production') return;

  // QR Simple quedó obsoleto (pagos híbridos: QR estático + comprobante por
  // WhatsApp), así que ya no se exige. Storage usa Cloudflare R2.
  const requiredInProd: Array<keyof Env> = [
    'DIRECT_URL',
    'TURNSTILE_SECRET_KEY',
    'WA_INTERNAL_SECRET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
    'R2_PUBLIC_URL',
  ];

  const missing = requiredInProd.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `\n🚨 Variables requeridas en producción están vacías:\n${missing
        .map((k) => `  ❌ ${k}`)
        .join('\n')}\n`,
    );
  }
}

/**
 * Valida las variables de entorno y retorna un objeto tipado.
 * Lanza un error descriptivo si alguna variable falta o es inválida.
 */
export function validateEnv(env: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ❌ ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `\n🚨 Error de configuración — Variables de entorno inválidas:\n${formatted}\n`,
    );
  }

  assertProductionInvariants(result.data);
  return result.data;
}
