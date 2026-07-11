import { existsSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

/**
 * Carga los .env ANTES de que se evalúen los decoradores de los módulos.
 *
 * ConfigModule también lee estos archivos, pero lo hace al inicializar la DI,
 * es decir DESPUÉS de que los `imports` de cada @Module ya se evaluaron. Los
 * feature flags eager (ENABLE_WHATSAPP, TELEGRAM_BOT_TOKEN) se deciden en ese
 * momento leyendo process.env, así que sin esta pre-carga solo funcionan si la
 * variable viene del shell/contenedor — nunca de un archivo .env local.
 *
 * Mismo orden de prioridad que el envFilePath de app.module.ts (el primero que
 * define una clave gana; dotenv no pisa claves ya presentes en process.env).
 */
const nodeEnv = process.env.NODE_ENV ?? 'development';
const candidates = [
  `.env.${nodeEnv}.local`,
  `.env.${nodeEnv}`,
  `../../.env.${nodeEnv}.local`,
  `../../.env.${nodeEnv}`,
  '.env.local',
  '.env',
  '../../.env',
];

for (const file of candidates) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) config({ path });
}
