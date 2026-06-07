/**
 * CLI de onboarding — crea un Tenant con su primer usuario ADMIN.
 *
 * Uso:
 *   pnpm create-tenant --name="Clínica Demo" --slug="clinica-demo" \
 *     --adminEmail="admin@demo.com" --adminPhone="59170000000" \
 *     --password="secreto123" --color="#0a70f8"
 *
 * Alias aceptados: --email (= --adminEmail), --phone (= --adminPhone).
 * Requeridos: name, slug, adminEmail, password. Opcionales: adminPhone, color.
 *
 * Requiere DATABASE_URL en el entorno (carga .env.development por defecto).
 */

import * as path from 'path';
// El .env vive en la raíz del monorepo (3 niveles arriba desde apps/api/cli/)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require('dotenv') as { config: (o?: { path?: string }) => void };
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.development') });

import { PrismaClient } from '@simplecite/database';
import type { Prisma } from '@simplecite/database';
import * as bcrypt from 'bcrypt';

// ─── Parsear args --key=value ───────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  return Object.fromEntries(
    argv
      .filter((a) => a.startsWith('--'))
      .map((a) => {
        const [key, ...rest] = a.slice(2).split('=');
        return [key, rest.join('=')];
      }),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { name, slug, password, color = '#0a70f8' } = args;
  // El spec usa adminEmail/adminPhone; aceptamos también los alias email/phone.
  const email = args.adminEmail ?? args.email;
  const adminPhone = args.adminPhone ?? args.phone;

  if (!name || !slug || !email || !password) {
    console.error(
      '❌ Faltan argumentos requeridos.\n' +
        'Uso: pnpm create-tenant --name="..." --slug="..." --adminEmail="..." --password="..." ' +
        '[--adminPhone="..."] [--color="#hex"]',
    );
    process.exit(1);
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    console.error('❌ Slug inválido — solo minúsculas, números y guiones.');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const tenant = await tx.tenant.create({
        data: {
          name,
          slug,
          primaryColor: color,
          plan: 'BASIC',
          status: 'TRIAL',
        },
      });

      const passwordHash = await bcrypt.hash(password, 12);

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          password: passwordHash,
          name: 'Admin',
          role: 'ADMIN',
          ...(adminPhone ? { phone: adminPhone } : {}),
        },
      });

      return { tenant, user };
    });

    console.log('✅ Tenant creado exitosamente');
    console.log(`   Nombre : ${result.tenant.name}`);
    console.log(`   Slug   : ${result.tenant.slug}`);
    console.log(`   ID     : ${result.tenant.id}`);
    console.log(`   Admin  : ${result.user.email}`);
    if (result.user.phone) console.log(`   Teléfono: ${result.user.phone}`);
    console.log(`\n   Panel  : https://${result.tenant.slug}.simplecite.com.bo/panel/login`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Unique constraint') || msg.includes('P2002')) {
      console.error('❌ Ya existe un tenant con ese slug o un usuario con ese email.');
    } else {
      console.error('❌ Error:', msg);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
