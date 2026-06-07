/**
 * Bootstrap de funciones RLS helper para una DB nueva.
 *
 * Ejecuta `scripts/bootstrap-rls-functions.sql` vía Prisma (sin depender de
 * `psql` instalado). DEBE correr ANTES de `prisma migrate deploy` en una base
 * fresca, porque las migraciones referencian `public.current_tenant_id()` que
 * no se crea en ninguna migración.
 *
 *   pnpm db:bootstrap   (o: pnpm --filter @simplecite/database db:bootstrap)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sqlPath = join(__dirname, '..', 'scripts', 'bootstrap-rls-functions.sql');
  const raw = readFileSync(sqlPath, 'utf8');

  // Quitar comentarios de línea y partir en statements por ';'.
  const statements = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }

  console.log(`✅ Bootstrap RLS: ${statements.length} funciones creadas/actualizadas`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Bootstrap falló:', err.message);
    process.exit(1);
  });
