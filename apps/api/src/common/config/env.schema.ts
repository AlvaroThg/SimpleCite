import { z } from 'zod';

/**
 * Validación de variables de entorno AL ARRANCAR.
 *
 * Sin esto, un secret faltante (JWT_SECRET, DATABASE_URL…) dejaba arrancar el
 * servidor y fallar recién en el primer request, de forma críptica. Ahora el
 * proceso termina de inmediato con el nombre exacto de la variable faltante.
 *
 * Reglas por entorno:
 *  - Siempre: DB + secrets JWT (con longitud mínima real, no strings de juguete).
 *  - Solo en producción: APP_DOMAIN (CORS/cookies) y R2 (logos/QR/galería
 *    son funcionalidad esencial del producto, no un extra).
 *  - ENABLE_WHATSAPP=true exige WA_INTERNAL_SECRET (el webhook interno del bot).
 *
 * `.passthrough()` es obligatorio: ConfigModule reemplaza el config por lo que
 * retorna `validate`; sin passthrough, toda env no listada desaparecería.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3001),

    // ─── Base de datos (Postgres propio) ───
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL es obligatoria')
      .startsWith('postgres', 'DATABASE_URL debe ser una URL postgresql://'),
    DIRECT_URL: z
      .string()
      .min(1, 'DIRECT_URL es obligatoria (migrate deploy)')
      .startsWith('postgres', 'DIRECT_URL debe ser una URL postgresql://'),

    // ─── Secrets JWT (staff y paciente, separados a propósito) ───
    JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
    PATIENT_JWT_SECRET: z.string().min(32, 'PATIENT_JWT_SECRET debe tener al menos 32 caracteres'),
    JWT_EXPIRATION: z.string().default('12h'),
    PATIENT_SESSION_TTL: z.string().default('30m'),

    // ─── Booking público ───
    PUBLIC_BOOKING_REQUIRE_OTP: z.enum(['true', 'false']).default('false'),
    OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
    TENTATIVE_APPOINTMENT_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    TURNSTILE_SECRET_KEY: z.string().optional(),

    // ─── Producción ───
    APP_DOMAIN: z.string().optional(),

    // ─── Cloudflare R2 (storage de imágenes) ───
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ENDPOINT: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_PUBLIC_URL: z.string().optional(),

    // ─── Feature flags ───
    ENABLE_WHATSAPP: z.enum(['true', 'false']).default('false'),
    RLS_ENFORCED: z.enum(['true', 'false']).default('false'),

    // ─── Bot de WhatsApp (solo con ENABLE_WHATSAPP=true) ───
    WA_INTERNAL_SECRET: z.string().optional(),
  })
  .passthrough()
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.APP_DOMAIN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_DOMAIN'],
          message: 'APP_DOMAIN es obligatoria en producción (CORS + cookie de sesión)',
        });
      }
      const r2Missing: string[] = [
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET',
        'R2_PUBLIC_URL',
      ].filter((k) => !env[k as keyof typeof env]);
      // Hace falta el endpoint o el account id (uno de los dos deriva el otro).
      if (!(env.R2_ACCOUNT_ID || env.R2_ENDPOINT)) {
        r2Missing.push('R2_ACCOUNT_ID');
      }
      for (const key of r2Missing) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} es obligatoria en producción (logos/QR/galería viven en R2)`,
        });
      }
    }
    if (env.ENABLE_WHATSAPP === 'true' && (env.WA_INTERNAL_SECRET?.length ?? 0) < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WA_INTERNAL_SECRET'],
        message: 'WA_INTERNAL_SECRET (16+ caracteres) es obligatoria con ENABLE_WHATSAPP=true',
      });
    }
  });

/** Valida el entorno; en fallo, termina el proceso con un mensaje accionable. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ✘ ${i.path.join('.')}: ${i.message}`);

    console.error(`\n❌ Variables de entorno inválidas o faltantes:\n${lines.join('\n')}\n`);
    throw new Error('Configuración de entorno inválida — el servidor no arranca.');
  }
  return result.data;
}
