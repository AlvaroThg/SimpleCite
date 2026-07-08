/**
 * Alta manual de una clínica (tu flujo de venta sin pasarela de pagos):
 * cuando un cliente te paga, corres este comando y le entregas sus accesos.
 *
 *   pnpm tenant:new <slug> "<Nombre de la clínica>" <admin-email> <password> [plan] [meses]
 *
 *   plan:  PRO (Profesional, default) | ELITE (Clínica) | BASIC (legacy)
 *   meses: duración de la suscripción pagada (default 1)
 *
 * Ejemplo:
 *   pnpm tenant:new dental-sonrisa "Dental Sonrisa" admin@dentalsonrisa.com S3guro123 PRO 3
 *
 * Es idempotente-seguro: si el slug ya existe, NO toca nada y te lo dice
 * (para renovar suscripciones usa `pnpm tenant:renew` — o SQL directo).
 */
import type { SubscriptionPlan } from '@prisma/client';
import { PrismaClient, TenantStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const [slug, name, email, password, planArg = 'PRO', monthsArg = '1'] = process.argv.slice(2);

  if (!slug || !name || !email || !password) {
    console.error(
      'Uso: pnpm tenant:new <slug> "<Nombre>" <admin-email> <password> [PRO|ELITE|BASIC] [meses]',
    );
    process.exit(1);
  }
  if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
    console.error('❌ Slug inválido: solo minúsculas, números y guiones (3-50 caracteres).');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ La contraseña del admin debe tener al menos 8 caracteres.');
    process.exit(1);
  }
  const plan = planArg.toUpperCase() as SubscriptionPlan;
  if (!['BASIC', 'PRO', 'ELITE'].includes(plan)) {
    console.error('❌ Plan inválido. Usa PRO (Profesional), ELITE (Clínica) o BASIC.');
    process.exit(1);
  }
  const months = Math.max(1, Number(monthsArg) || 1);

  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    console.error(`❌ El slug "${slug}" ya existe (${existing.name}). No se tocó nada.`);
    process.exit(1);
  }

  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + months);

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name,
      plan,
      status: TenantStatus.ACTIVE,
      timezone: 'America/La_Paz',
      subscriptionStatus: 'ACTIVE',
      subscriptionEndDate: endDate,
    },
  });

  await prisma.user.create({
    data: {
      email,
      password: await bcrypt.hash(password, 10),
      name: `Administración ${name}`,
      role: UserRole.ADMIN,
      tenantId: tenant.id,
    },
  });

  const planLabel = plan === 'ELITE' ? 'Clínica' : plan === 'PRO' ? 'Profesional' : 'Básico';
  console.log('\n🎉 Clínica creada. Entrega estos accesos al cliente:\n');
  console.log(`   Página pública: /${slug}`);
  console.log(`   Panel:          /panel/login (slug: ${slug})`);
  console.log(`   Admin:          ${email}`);
  console.log(`   Plan:           ${planLabel} · vence ${endDate.toISOString().slice(0, 10)}`);
  console.log('\n   Siguiente paso del cliente: Configuración → marca, logo, QR y doctores.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
