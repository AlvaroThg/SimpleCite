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

  // ─── Supabase ───
  SUPABASE_URL: z.string().url('SUPABASE_URL debe ser una URL válida'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY es requerida'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY es requerida'),

  // ─── JWT propio (NestJS firma) ───
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRATION: z.string().default('24h'),

  // ─── App ───
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  APP_DOMAIN: z.string().default('simplecite.com.bo'),

  // ─── QR Simple (pasarela de pagos Bolivia) ───
  QR_SIMPLE_API_URL: z.string().url().optional(),
  QR_SIMPLE_API_KEY: z.string().optional(),
  QR_SIMPLE_WEBHOOK_SECRET: z
    .string()
    .min(16, 'QR_SIMPLE_WEBHOOK_SECRET debe tener al menos 16 caracteres')
    .optional(),

  // ─── WhatsApp Orchestrator (controla los Dockers por clínica) ───
  WHATSAPP_ORCHESTRATOR_URL: z.string().url().optional(),
  WHATSAPP_ORCHESTRATOR_TOKEN: z.string().optional(),

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

  const requiredInProd: Array<keyof Env> = [
    'DIRECT_URL',
    'QR_SIMPLE_API_URL',
    'QR_SIMPLE_API_KEY',
    'QR_SIMPLE_WEBHOOK_SECRET',
    'WHATSAPP_ORCHESTRATOR_URL',
    'WHATSAPP_ORCHESTRATOR_TOKEN',
    'TURNSTILE_SECRET_KEY',
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
