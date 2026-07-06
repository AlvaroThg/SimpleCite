import { PrismaClient, UserRole, SubscriptionPlan, TenantStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

/** Fecha a `days` días de hoy (negativo = pasado), a la hora indicada. */
function at(days: number, hour = 0, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log('🌱 Iniciando seed de SimpleCite...\n');

  // ─── 1. Tenant: Regenera (consultorio de fisioterapia) ───
  // Re-seed sobre una DB existente: SOLO renueva la suscripción. Nunca pisa
  // branding, doctores, servicios ni citas que el admin ya personalizó.
  const existing = await prisma.tenant.findUnique({ where: { slug: 'regenera' } });
  const isFresh = !existing;

  const regeneraConfig = {
    name: 'Regenera: Fisioterapia Avanzada',
    primaryColor: '#0F766E',
    secondaryColor: '#2DD4BF',
    heroTitle: 'Recupera tu movilidad en Regenera',
    heroSubtitle:
      'Fisioterapia especializada en Tarija. Reserva tu sesión en línea, sin llamadas y sin filas.',
    ctaTitle: '¿Listo para tu primera sesión?',
    address: 'Tarija, Bolivia',
    whatsappContact: '59170000000',
    plan: SubscriptionPlan.PRO,
    status: TenantStatus.ACTIVE,
    timezone: 'America/La_Paz',
    whatsappEnabled: false,
    subscriptionStatus: 'ACTIVE',
    subscriptionEndDate: at(30),
  };
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'regenera' },
    update: { subscriptionStatus: 'ACTIVE', subscriptionEndDate: at(30) },
    create: { slug: 'regenera', ...regeneraConfig },
  });
  console.log(
    `  ✅ Tenant: ${tenant.name} (${tenant.id}) — ${isFresh ? 'creado' : 'existente, suscripción renovada'}`,
  );

  // ─── 2. Admin (siempre garantizado; update:{} = no toca el existente) ───
  const adminPassword = await bcrypt.hash('admin123', SALT_ROUNDS);
  const admin = await prisma.user.upsert({
    where: { email_tenantId: { email: 'admin@regenera.com', tenantId: tenant.id } },
    update: {},
    create: {
      email: 'admin@regenera.com',
      password: adminPassword,
      name: 'Administración Regenera',
      role: UserRole.ADMIN,
      phone: '59170000001',
      tenantId: tenant.id,
    },
  });
  console.log(`  ✅ Admin: ${admin.email}`);

  // ─── 3-7. Contenido demo SOLO en DB fresca (doctor, servicios, horarios) ───
  // En una DB con datos reales, nada de esto corre: el consultorio ya tiene
  // sus doctores y servicios cargados desde el panel.
  if (isFresh) {
    const doctorPassword = await bcrypt.hash('doctor123', SALT_ROUNDS);
    const doctor = await prisma.user.upsert({
      where: { email_tenantId: { email: 'fisio@regenera.com', tenantId: tenant.id } },
      update: {},
      create: {
        email: 'fisio@regenera.com',
        password: doctorPassword,
        name: 'Lic. Fisioterapeuta',
        role: UserRole.DOCTOR,
        phone: '59170000002',
        tenantId: tenant.id,
      },
    });
    await prisma.doctorProfile.upsert({
      where: { userId: doctor.id },
      update: {},
      create: {
        userId: doctor.id,
        tenantId: tenant.id,
        specialty: 'Fisioterapia',
        bio: 'Especialista en rehabilitación física y terapia manual.',
      },
    });
    console.log(`  ✅ Doctor: ${doctor.email} (Fisioterapia)`);

    const servicios = [
      {
        name: 'Sesión de Fisioterapia',
        description: 'Evaluación y tratamiento fisioterapéutico personalizado',
        price: 120.0,
        duration: 45,
        icon: 'activity',
      },
      {
        name: 'Tratamiento de Columna',
        description: 'Terapia especializada para dolores de espalda y columna',
        price: 150.0,
        duration: 60,
        icon: 'bone',
      },
      {
        name: 'Rehabilitación Deportiva',
        description: 'Recuperación de lesiones deportivas y retorno a la actividad',
        price: 140.0,
        duration: 60,
        icon: 'heart',
      },
    ];
    const serviciosCreados = [];
    for (const servicio of servicios) {
      const created = await prisma.service.upsert({
        where: { name_tenantId: { name: servicio.name, tenantId: tenant.id } },
        update: {},
        create: { ...servicio, tenantId: tenant.id },
      });
      serviciosCreados.push(created);
      console.log(`  ✅ Servicio: ${created.name} (Bs ${servicio.price})`);
    }

    for (const servicio of serviciosCreados) {
      await prisma.doctorService.upsert({
        where: { doctorId_serviceId: { doctorId: doctor.id, serviceId: servicio.id } },
        update: {},
        create: { doctorId: doctor.id, serviceId: servicio.id, tenantId: tenant.id },
      });
    }
    console.log(`  ✅ DoctorServices: ${serviciosCreados.length} asignados`);

    // Horario Lun-Vie 08:00-12:00 + 14:00-18:00
    const horarios = [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
      { dayOfWeek, startMinute: 8 * 60, endMinute: 12 * 60 },
      { dayOfWeek, startMinute: 14 * 60, endMinute: 18 * 60 },
    ]);
    for (const horario of horarios) {
      await prisma.doctorScheduleRule.create({
        data: { ...horario, doctorId: doctor.id, tenantId: tenant.id },
      });
    }
    console.log(`  ✅ Horario: ${horarios.length} reglas (Lun-Vie 8-12 y 14-18)`);
  } else {
    console.log('  ↷ DB existente: doctores/servicios/citas intactos (no se tocan)');
  }

  // ─── Tenant de prueba: suscripción VENCIDA (para probar el bloqueo 402) ───
  const vencidaConfig = {
    name: 'Clínica Vencida (test 402)',
    primaryColor: '#9333EA',
    plan: SubscriptionPlan.BASIC,
    status: TenantStatus.ACTIVE,
    timezone: 'America/La_Paz',
    subscriptionStatus: 'CANCELED',
    subscriptionEndDate: at(-5),
  };
  const tenant2 = await prisma.tenant.upsert({
    where: { slug: 'clinica-vencida' },
    update: vencidaConfig,
    create: { slug: 'clinica-vencida', ...vencidaConfig },
  });
  const admin2Password = await bcrypt.hash('admin123', SALT_ROUNDS);
  await prisma.user.upsert({
    where: { email_tenantId: { email: 'admin@clinica-vencida.com', tenantId: tenant2.id } },
    update: {},
    create: {
      email: 'admin@clinica-vencida.com',
      password: admin2Password,
      name: 'Admin Vencida',
      role: UserRole.ADMIN,
      tenantId: tenant2.id,
    },
  });
  console.log(`  ✅ Tenant 2: ${tenant2.slug} — suscripción CANCELED (para probar 402)`);

  console.log('\n🎉 Seed completado!\n');
  console.log('📋 Resumen:');
  console.log('   ── Regenera ──');
  console.log('   Landing: /regenera');
  console.log('   Admin:   admin@regenera.com / admin123  (cambia la contraseña en prod)');
  if (isFresh) console.log('   Doctor:  fisio@regenera.com / doctor123');
  console.log('   ── Clínica vencida (prueba bloqueo 402) ──');
  console.log('   Admin:   admin@clinica-vencida.com / admin123');
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
