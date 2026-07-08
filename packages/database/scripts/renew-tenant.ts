/**
 * Renovación manual de la suscripción de una clínica (cuando el cliente
 * vuelve a pagarte):
 *
 *   pnpm tenant:renew <slug> [meses] [plan]
 *
 *   meses: cuántos meses pagó (default 1)
 *   plan:  opcional, para cambiarlo en la renovación (PRO | ELITE | BASIC)
 *
 * Ejemplos:
 *   pnpm tenant:renew regenera            → +1 mes
 *   pnpm tenant:renew regenera 3          → +3 meses
 *   pnpm tenant:renew regenera 1 ELITE    → +1 mes y sube a plan Clínica
 *
 * La extensión parte del vencimiento actual si la suscripción sigue vigente
 * (renovar antes de tiempo no regala días), o de HOY si ya venció. Siempre
 * reactiva la suscripción (quita el bloqueo 402 del panel y el booking).
 */
import type { SubscriptionPlan } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLAN_LABEL: Record<SubscriptionPlan, string> = {
  BASIC: 'Básico (legacy)',
  PRO: 'Profesional',
  ELITE: 'Clínica',
};

async function main() {
  const [slug, monthsArg = '1', planArg] = process.argv.slice(2);

  if (!slug) {
    console.error('Uso: pnpm tenant:renew <slug> [meses] [PRO|ELITE|BASIC]');
    process.exit(1);
  }
  const months = Math.max(1, Number(monthsArg) || 1);

  let plan: SubscriptionPlan | undefined;
  if (planArg) {
    const upper = planArg.toUpperCase();
    if (!['BASIC', 'PRO', 'ELITE'].includes(upper)) {
      console.error('❌ Plan inválido. Usa PRO (Profesional), ELITE (Clínica) o BASIC.');
      process.exit(1);
    }
    plan = upper as SubscriptionPlan;
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error(`❌ No existe una clínica con slug "${slug}".`);
    process.exit(1);
  }

  // Base de la extensión: el vencimiento vigente o hoy, lo que sea mayor.
  const now = new Date();
  const currentEnd = tenant.subscriptionEndDate;
  const base = currentEnd && currentEnd > now ? new Date(currentEnd) : now;
  const newEnd = new Date(base);
  newEnd.setMonth(newEnd.getMonth() + months);

  const updated = await prisma.tenant.update({
    where: { slug },
    data: {
      subscriptionStatus: 'ACTIVE',
      subscriptionEndDate: newEnd,
      ...(plan ? { plan } : {}),
    },
  });

  const wasExpired = !currentEnd || currentEnd < now;
  console.log(`\n✅ Suscripción de "${updated.name}" renovada:\n`);
  console.log(`   Plan:        ${PLAN_LABEL[updated.plan]}${plan ? ' (cambiado)' : ''}`);
  console.log(
    `   Vencimiento: ${newEnd.toISOString().slice(0, 10)} (+${months} mes${months > 1 ? 'es' : ''}${
      wasExpired ? ', desde hoy — estaba vencida' : ', desde su vencimiento anterior'
    })`,
  );
  console.log('   Estado:      ACTIVE — panel y booking desbloqueados.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
