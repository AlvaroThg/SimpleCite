import { z } from 'zod';

/**
 * Schema de validación para las variables de entorno de SimpleCite.
 * Se valida en runtime al iniciar cualquier app del monorepo.
 */
export const envSchema = z.object({
  // ─── Database ───
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),

  // ─── Supabase ───
  SUPABASE_URL: z.string().url('SUPABASE_URL debe ser una URL válida'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY es requerida'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY es requerida'),

  // ─── JWT ───
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRATION: z.string().default('24h'),

  // ─── App ───
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  APP_DOMAIN: z.string().default('simplecite.com.bo'),
});

export type Env = z.infer<typeof envSchema>;

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

    throw new Error(`\n🚨 Error de configuración — Variables de entorno inválidas:\n${formatted}\n`);
  }

  return result.data;
}
