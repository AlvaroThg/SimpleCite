import { PrismaClient, UserRole, SubscriptionPlan, TenantStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main() {
  console.log('🌱 Iniciando seed de SimpleCite...\n');

  // ─── 1. Tenant Demo ───
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'clinica-demo' },
    update: {},
    create: {
      slug: 'clinica-demo',
      name: 'Clínica Demo Tarija',
      primaryColor: '#3B82F6',
      plan: SubscriptionPlan.PRO,
      status: TenantStatus.ACTIVE,
      timezone: 'America/La_Paz',
      whatsappEnabled: false,
    },
  });
  console.log(`  ✅ Tenant: ${tenant.name} (${tenant.id})`);

  // ─── 2. Admin ───
  const adminPassword = await bcrypt.hash('admin123', SALT_ROUNDS);
  const admin = await prisma.user.upsert({
    where: {
      email_tenantId: { email: 'admin@clinica-demo.com', tenantId: tenant.id },
    },
    update: {},
    create: {
      email: 'admin@clinica-demo.com',
      password: adminPassword,
      name: 'Administrador Demo',
      role: UserRole.ADMIN,
      tenantId: tenant.id,
    },
  });
  console.log(`  ✅ Admin: ${admin.email}`);

  // ─── 3. Doctor + DoctorProfile ───
  const doctorPassword = await bcrypt.hash('doctor123', SALT_ROUNDS);
  const doctor = await prisma.user.upsert({
    where: {
      email_tenantId: { email: 'dr.rodriguez@clinica-demo.com', tenantId: tenant.id },
    },
    update: {},
    create: {
      email: 'dr.rodriguez@clinica-demo.com',
      password: doctorPassword,
      name: 'Dr. Carlos Rodríguez',
      role: UserRole.DOCTOR,
      tenantId: tenant.id,
    },
  });
  await prisma.doctorProfile.upsert({
    where: { userId: doctor.id },
    update: {},
    create: {
      userId: doctor.id,
      tenantId: tenant.id,
      specialty: 'Medicina General',
      licenseNumber: 'MAT-12345',
      bio: 'Médico general con 10 años de experiencia en atención primaria.',
    },
  });
  console.log(`  ✅ Doctor: ${doctor.email} (Medicina General)`);

  // ─── 4. Staff + StaffProfile ───
  const staffPassword = await bcrypt.hash('staff123', SALT_ROUNDS);
  const staff = await prisma.user.upsert({
    where: {
      email_tenantId: { email: 'recepcion@clinica-demo.com', tenantId: tenant.id },
    },
    update: {},
    create: {
      email: 'recepcion@clinica-demo.com',
      password: staffPassword,
      name: 'María López',
      role: UserRole.STAFF,
      tenantId: tenant.id,
    },
  });
  await prisma.staffProfile.upsert({
    where: { userId: staff.id },
    update: {},
    create: {
      userId: staff.id,
      tenantId: tenant.id,
      position: 'Recepcionista',
    },
  });
  console.log(`  ✅ Staff: ${staff.email} (Recepcionista)`);

  // ─── 5. Catálogo de Servicios ───
  const servicios = [
    {
      name: 'Consulta General',
      description: 'Consulta médica general con diagnóstico y receta',
      price: 80.0,
      duration: 30,
    },
    {
      name: 'Sesión Fisioterapia',
      description: 'Sesión de fisioterapia con evaluación y tratamiento',
      price: 120.0,
      duration: 45,
    },
    {
      name: 'Ecografía',
      description: 'Estudio ecográfico abdominal o pélvico',
      price: 150.0,
      duration: 30,
    },
    {
      name: 'Control Prenatal',
      description: 'Control prenatal completo con monitoreo fetal',
      price: 100.0,
      duration: 40,
    },
    {
      name: 'Limpieza Dental',
      description: 'Limpieza dental profiláctica con ultrasonido',
      price: 60.0,
      duration: 20,
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

  // ─── 6. DoctorServices: el doctor ofrece "Consulta General" y "Control Prenatal" ───
  const serviciosDelDoctor = serviciosCreados.filter((s) =>
    ['Consulta General', 'Control Prenatal'].includes(s.name),
  );
  for (const servicio of serviciosDelDoctor) {
    await prisma.doctorService.upsert({
      where: {
        doctorId_serviceId: { doctorId: doctor.id, serviceId: servicio.id },
      },
      update: {},
      create: {
        doctorId: doctor.id,
        serviceId: servicio.id,
        tenantId: tenant.id,
      },
    });
    console.log(`  ✅ DoctorService: ${doctor.name} → ${servicio.name}`);
  }

  // ─── 7. ScheduleRules: Lun-Vie 08:00-12:00 + 14:00-18:00 ───
  const horarios = [
    { dayOfWeek: 1, startMinute: 8 * 60, endMinute: 12 * 60 }, // Lun mañana
    { dayOfWeek: 1, startMinute: 14 * 60, endMinute: 18 * 60 }, // Lun tarde
    { dayOfWeek: 2, startMinute: 8 * 60, endMinute: 12 * 60 },
    { dayOfWeek: 2, startMinute: 14 * 60, endMinute: 18 * 60 },
    { dayOfWeek: 3, startMinute: 8 * 60, endMinute: 12 * 60 },
    { dayOfWeek: 3, startMinute: 14 * 60, endMinute: 18 * 60 },
    { dayOfWeek: 4, startMinute: 8 * 60, endMinute: 12 * 60 },
    { dayOfWeek: 4, startMinute: 14 * 60, endMinute: 18 * 60 },
    { dayOfWeek: 5, startMinute: 8 * 60, endMinute: 12 * 60 },
    { dayOfWeek: 5, startMinute: 14 * 60, endMinute: 18 * 60 },
  ];
  // Limpia reglas previas del doctor antes de re-sembrar para que el seed sea idempotente.
  await prisma.doctorScheduleRule.deleteMany({ where: { doctorId: doctor.id } });
  for (const horario of horarios) {
    await prisma.doctorScheduleRule.create({
      data: { ...horario, doctorId: doctor.id, tenantId: tenant.id },
    });
  }
  console.log(`  ✅ Horario: ${horarios.length} reglas (Lun-Vie 8-12 y 14-18)`);

  console.log('\n🎉 Seed completado exitosamente!');
  console.log(`\n📋 Resumen:`);
  console.log(`   Tenant: ${tenant.slug} (${tenant.id})`);
  console.log(`   Admin:  admin@clinica-demo.com / admin123`);
  console.log(`   Doctor: dr.rodriguez@clinica-demo.com / doctor123`);
  console.log(`   Staff:  recepcion@clinica-demo.com / staff123`);
  console.log(`   Servicios: ${servicios.length} creados`);
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
