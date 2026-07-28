/**
 * Elimina pacientes de una clínica (mantenimiento / limpieza de pruebas del bot).
 * Borra el paciente y, por cascada de FK, sus citas y registros; además limpia
 * las booking_notifications huérfanas y la conversación del bot de ese número.
 *
 *   pnpm tenant:rm-patient <slug> <telefono-o-nombre>
 *
 * Ejemplos:
 *   pnpm tenant:rm-patient demo-bot 60251607        → por teléfono (contiene)
 *   pnpm tenant:rm-patient demo-bot "Hola"          → por nombre (contiene)
 *
 * Con solo el slug lista los pacientes de la clínica (no borra nada).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [slug, query] = process.argv.slice(2);

  if (!slug) {
    console.error('Uso: pnpm tenant:rm-patient <slug> <telefono-o-nombre>');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!tenant) {
    console.error(`❌ No existe una clínica con slug "${slug}".`);
    process.exit(1);
  }

  // Sin query: solo lista (modo seguro para ver a quién apuntar).
  if (!query) {
    const all = await prisma.patient.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, phone: true, _count: { select: { appointments: true } } },
      orderBy: { createdAt: 'desc' },
    });
    console.log(`👥 Pacientes de "${tenant.name}" (${all.length}):`);
    for (const p of all) {
      console.log(`  · ${p.name} — ${p.phone ?? 'sin teléfono'} (${p._count.appointments} citas)`);
    }
    console.log('\nPara borrar: pnpm tenant:rm-patient ' + slug + ' <telefono-o-nombre>');
    return;
  }

  // El segundo argumento se interpreta como teléfono si es casi todo dígitos.
  const isPhone = /^[+\d][\d\s-]{3,}$/.test(query);
  const patients = await prisma.patient.findMany({
    where: {
      tenantId: tenant.id,
      ...(isPhone
        ? { phone: { contains: query.replace(/[\s-]/g, '') } }
        : { name: { contains: query, mode: 'insensitive' } }),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      appointments: { select: { id: true } },
    },
  });

  if (patients.length === 0) {
    console.error(`❌ Ningún paciente en "${tenant.name}" coincide con "${query}".`);
    process.exit(1);
  }

  console.log(`Se eliminarán ${patients.length} paciente(s) de "${tenant.name}":`);
  for (const p of patients) {
    console.log(`  · ${p.name} — ${p.phone ?? 'sin teléfono'} (${p.appointments.length} citas)`);
  }

  const apptIds = patients.flatMap((p) => p.appointments.map((a) => a.id));
  const phones = patients.map((p) => p.phone).filter((x): x is string => Boolean(x));

  await prisma.$transaction([
    // booking_notifications no tiene FK: hay que limpiarlas a mano.
    prisma.bookingNotification.deleteMany({ where: { appointmentId: { in: apptIds } } }),
    // Reinicia la conversación del bot de esos números (arranca limpio).
    prisma.botConversation.deleteMany({ where: { chatId: { in: phones } } }),
    // El paciente arrastra por cascada sus citas, pagos y registros.
    prisma.patient.deleteMany({ where: { id: { in: patients.map((p) => p.id) } } }),
  ]);

  console.log(`✅ Listo. Eliminados ${patients.length} paciente(s) y sus citas.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
