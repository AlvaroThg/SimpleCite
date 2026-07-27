/**
 * Activa o desactiva el bot de WhatsApp para una clínica (add-on de plataforma).
 * El bot centralizado SOLO resuelve/atiende clínicas con esto encendido; lo
 * controla la plataforma, no el admin del tenant desde su panel.
 *
 *   pnpm tenant:bot <slug> <on|off>
 *
 * Ejemplos:
 *   pnpm tenant:bot clinica-demo on    → el bot ya atiende a esta clínica
 *   pnpm tenant:bot regenera off       → el bot deja de resolverla
 *
 * Sin argumentos (o solo el slug) imprime el estado actual.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [slug, stateArg] = process.argv.slice(2);

  if (!slug) {
    console.error('Uso: pnpm tenant:bot <slug> <on|off>');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, botEnabled: true },
  });
  if (!tenant) {
    console.error(`❌ No existe una clínica con slug "${slug}".`);
    process.exit(1);
  }

  // Sin estado: solo consulta.
  if (!stateArg) {
    console.log(
      `🤖 Bot de WhatsApp para "${tenant.name}" (${slug}): ${
        tenant.botEnabled ? 'ACTIVADO ✅' : 'desactivado'
      }`,
    );
    return;
  }

  const normalized = stateArg.toLowerCase();
  if (!['on', 'off'].includes(normalized)) {
    console.error('El estado debe ser "on" u "off".');
    process.exit(1);
  }
  const botEnabled = normalized === 'on';

  await prisma.tenant.update({ where: { id: tenant.id }, data: { botEnabled } });
  console.log(
    `🤖 Bot de WhatsApp para "${tenant.name}" (${slug}): ${
      botEnabled ? 'ACTIVADO ✅ (el bot ya la atiende)' : 'DESACTIVADO (el bot deja de resolverla)'
    }`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
