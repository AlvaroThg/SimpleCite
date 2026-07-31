/**
 * Define qué ofrece la página pública de una clínica (rasgo del plan, lo
 * controla la plataforma — no el admin del tenant desde su panel).
 *
 *   pnpm tenant:mode <slug> <booking|whatsapp|landing>
 *
 *   booking  → reserva web completa (plan Profesional).
 *   whatsapp → sin reserva web: el CTA abre el WhatsApp de la clínica (Básico).
 *   landing  → página solo informativa; agenda únicamente el staff en el panel.
 *
 * Sin el modo imprime el estado actual.
 */
import type { PublicMode } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LABELS: Record<PublicMode, string> = {
  BOOKING: 'BOOKING — reserva web completa',
  WHATSAPP: 'WHATSAPP — el CTA abre el chat de la clínica (sin reserva web)',
  LANDING: 'LANDING — página solo informativa (agenda el staff)',
};

async function main() {
  const [slug, modeArg] = process.argv.slice(2);

  if (!slug) {
    console.error('Uso: pnpm tenant:mode <slug> <booking|whatsapp|landing>');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, publicMode: true, whatsappContact: true },
  });
  if (!tenant) {
    console.error(`❌ No existe una clínica con slug "${slug}".`);
    process.exit(1);
  }

  if (!modeArg) {
    console.log(`🌐 Página pública de "${tenant.name}" (${slug}): ${LABELS[tenant.publicMode]}`);
    return;
  }

  const mode = modeArg.toUpperCase() as PublicMode;
  if (!['BOOKING', 'WHATSAPP', 'LANDING'].includes(mode)) {
    console.error('El modo debe ser "booking", "whatsapp" o "landing".');
    process.exit(1);
  }

  // En modo WhatsApp el CTA necesita el número público; sin él la landing cae
  // a "Llamar" y el plan no se ve como debería.
  if (mode === 'WHATSAPP' && !tenant.whatsappContact) {
    console.warn(
      `⚠️  "${tenant.name}" no tiene número de contacto (whatsappContact).\n` +
        '   Cárgalo en el panel para que el botón de WhatsApp funcione.',
    );
  }

  await prisma.tenant.update({ where: { id: tenant.id }, data: { publicMode: mode } });
  console.log(`🌐 Página pública de "${tenant.name}" (${slug}): ${LABELS[mode]}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
