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

  // ─── 1. Tenant Demo (suscripción ACTIVA + branding personalizado) ───
  const demoConfig = {
    name: 'Clínica Demo Tarija',
    primaryColor: '#3B82F6',
    secondaryColor: '#0EA5A4',
    heroTitle: 'Tu salud primero, en Clínica Demo Tarija',
    heroSubtitle:
      'Reserva en línea con nuestros especialistas y recibe la confirmación por WhatsApp. Sin llamadas, sin filas.',
    ctaTitle: '¿Listo para agendar tu cita?',
    plan: SubscriptionPlan.PRO,
    status: TenantStatus.ACTIVE,
    timezone: 'America/La_Paz',
    whatsappEnabled: false,
    subscriptionStatus: 'ACTIVE',
    subscriptionEndDate: at(30),
  };
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'clinica-demo' },
    update: demoConfig,
    create: { slug: 'clinica-demo', ...demoConfig },
  });
  console.log(`  ✅ Tenant: ${tenant.name} (${tenant.id}) — suscripción ACTIVE`);

  // ─── 2. Admin ───
  const adminPassword = await bcrypt.hash('admin123', SALT_ROUNDS);
  const admin = await prisma.user.upsert({
    where: { email_tenantId: { email: 'admin@clinica-demo.com', tenantId: tenant.id } },
    update: { phone: '59170000001' },
    create: {
      email: 'admin@clinica-demo.com',
      password: adminPassword,
      name: 'Administrador Demo',
      role: UserRole.ADMIN,
      phone: '59170000001',
      tenantId: tenant.id,
    },
  });
  console.log(`  ✅ Admin: ${admin.email}`);

  // ─── 3. Doctor + DoctorProfile ───
  const doctorPassword = await bcrypt.hash('doctor123', SALT_ROUNDS);
  const doctor = await prisma.user.upsert({
    where: { email_tenantId: { email: 'dr.rodriguez@clinica-demo.com', tenantId: tenant.id } },
    update: { phone: '59170000002' },
    create: {
      email: 'dr.rodriguez@clinica-demo.com',
      password: doctorPassword,
      name: 'Dr. Carlos Rodríguez',
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
      specialty: 'Medicina General',
      licenseNumber: 'MAT-12345',
      bio: 'Médico general con 10 años de experiencia en atención primaria.',
    },
  });
  console.log(`  ✅ Doctor: ${doctor.email} (Medicina General)`);

  // ─── 4. Staff + StaffProfile ───
  const staffPassword = await bcrypt.hash('staff123', SALT_ROUNDS);
  const staff = await prisma.user.upsert({
    where: { email_tenantId: { email: 'recepcion@clinica-demo.com', tenantId: tenant.id } },
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
    create: { userId: staff.id, tenantId: tenant.id, position: 'Recepcionista' },
  });
  console.log(`  ✅ Staff: ${staff.email} (Recepcionista)`);

  // ─── 5. Catálogo de Servicios (con ícono para la landing) ───
  const servicios = [
    {
      name: 'Consulta General',
      description: 'Consulta médica general con diagnóstico y receta',
      price: 80.0,
      duration: 30,
      icon: 'stethoscope',
    },
    {
      name: 'Sesión Fisioterapia',
      description: 'Sesión de fisioterapia con evaluación y tratamiento',
      price: 120.0,
      duration: 45,
      icon: 'activity',
    },
    {
      name: 'Ecografía',
      description: 'Estudio ecográfico abdominal o pélvico',
      price: 150.0,
      duration: 30,
      icon: 'scan',
    },
    {
      name: 'Control Prenatal',
      description: 'Control prenatal completo con monitoreo fetal',
      price: 100.0,
      duration: 40,
      icon: 'baby',
    },
    {
      name: 'Limpieza Dental',
      description: 'Limpieza dental profiláctica con ultrasonido',
      price: 60.0,
      duration: 20,
      icon: 'heart',
    },
  ];

  const serviciosCreados = [];
  for (const servicio of servicios) {
    const created = await prisma.service.upsert({
      where: { name_tenantId: { name: servicio.name, tenantId: tenant.id } },
      update: {
        description: servicio.description,
        price: servicio.price,
        duration: servicio.duration,
        icon: servicio.icon,
      },
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
      where: { doctorId_serviceId: { doctorId: doctor.id, serviceId: servicio.id } },
      update: {},
      create: { doctorId: doctor.id, serviceId: servicio.id, tenantId: tenant.id },
    });
    console.log(`  ✅ DoctorService: ${doctor.name} → ${servicio.name}`);
  }

  // ─── 7. ScheduleRules: Lun-Vie 08:00-12:00 + 14:00-18:00 ───
  const horarios = [
    { dayOfWeek: 1, startMinute: 8 * 60, endMinute: 12 * 60 },
    { dayOfWeek: 1, startMinute: 14 * 60, endMinute: 18 * 60 },
    { dayOfWeek: 2, startMinute: 8 * 60, endMinute: 12 * 60 },
    { dayOfWeek: 2, startMinute: 14 * 60, endMinute: 18 * 60 },
    { dayOfWeek: 3, startMinute: 8 * 60, endMinute: 12 * 60 },
    { dayOfWeek: 3, startMinute: 14 * 60, endMinute: 18 * 60 },
    { dayOfWeek: 4, startMinute: 8 * 60, endMinute: 12 * 60 },
    { dayOfWeek: 4, startMinute: 14 * 60, endMinute: 18 * 60 },
    { dayOfWeek: 5, startMinute: 8 * 60, endMinute: 12 * 60 },
    { dayOfWeek: 5, startMinute: 14 * 60, endMinute: 18 * 60 },
  ];
  await prisma.doctorScheduleRule.deleteMany({ where: { doctorId: doctor.id } });
  for (const horario of horarios) {
    await prisma.doctorScheduleRule.create({
      data: { ...horario, doctorId: doctor.id, tenantId: tenant.id },
    });
  }
  console.log(`  ✅ Horario: ${horarios.length} reglas (Lun-Vie 8-12 y 14-18)`);

  // ─── 8. Pacientes ───
  const pacientesData = [
    { name: 'Juan Pérez', phone: '59171111111', ci: '1111111' },
    { name: 'María Gutiérrez', phone: '59172222222', ci: '2222222' },
    { name: 'Pedro Gómez', phone: '59173333333', ci: '3333333' },
    { name: 'Ana Flores', phone: '59174444444', ci: '4444444' },
  ];
  const pacientes = [];
  for (const p of pacientesData) {
    const created = await prisma.patient.upsert({
      where: { phone_tenantId: { phone: p.phone, tenantId: tenant.id } },
      update: { name: p.name, ci: p.ci },
      create: { ...p, tenantId: tenant.id },
    });
    pacientes.push(created);
  }
  console.log(`  ✅ Pacientes: ${pacientes.length} creados`);

  // ─── 9. Citas en todos los estados/pagos (idempotente: borra y recrea) ───
  await prisma.appointment.deleteMany({ where: { tenantId: tenant.id } });
  const consulta = serviciosCreados.find((s) => s.name === 'Consulta General')!;
  const prenatal = serviciosCreados.find((s) => s.name === 'Control Prenatal')!;

  const citas = [
    // CONFIRMED hoy → cuenta en "Citas de hoy" y "Próximas citas"
    {
      paciente: pacientes[1],
      servicio: consulta,
      start: at(0, 23, 0),
      status: 'CONFIRMED',
      paymentMethod: 'CASH',
    },
    // CONFIRMED + CASH → badge "Por cobrar en clínica"
    {
      paciente: pacientes[0],
      servicio: consulta,
      start: at(1, 9, 0),
      status: 'CONFIRMED',
      paymentMethod: 'CASH',
    },
    // PENDING_PAYMENT + STATIC_QR sin comprobante → "Esperando comprobante"
    {
      paciente: pacientes[1],
      servicio: consulta,
      start: at(1, 10, 0),
      status: 'PENDING_PAYMENT',
      paymentMethod: 'STATIC_QR',
    },
    // PENDING_PAYMENT + STATIC_QR con comprobante → "Ver Comprobante" + "Aprobar Pago"
    {
      paciente: pacientes[2],
      servicio: prenatal,
      start: at(1, 11, 0),
      status: 'PENDING_PAYMENT',
      paymentMethod: 'STATIC_QR',
      receiptUrl: 'https://placehold.co/600x800/png?text=Comprobante+de+pago',
    },
    // CONFIRMED + STATIC_QR pagado → badge "QR Pagado"
    {
      paciente: pacientes[3],
      servicio: consulta,
      start: at(2, 9, 0),
      status: 'CONFIRMED',
      paymentMethod: 'STATIC_QR',
      isPaid: true,
    },
    // COMPLETED (historial)
    {
      paciente: pacientes[0],
      servicio: consulta,
      start: at(-3, 9, 0),
      status: 'COMPLETED',
      paymentMethod: 'CASH',
    },
  ];
  for (const c of citas) {
    await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        patientId: c.paciente.id,
        doctorId: doctor.id,
        serviceId: c.servicio.id,
        startTime: c.start,
        endTime: new Date(c.start.getTime() + c.servicio.duration * 60_000),
        status: c.status as never,
        paymentMethod: c.paymentMethod as never,
        ...(c.receiptUrl ? { receiptUrl: c.receiptUrl } : {}),
        ...(c.isPaid ? { isPaid: true } : {}),
      },
    });
  }
  console.log(`  ✅ Citas: ${citas.length} (CASH/STATIC_QR, pendientes y confirmadas)`);

  // ─── 10. Segundo tenant: suscripción VENCIDA (para probar el bloqueo 402) ───
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

  console.log('\n🎉 Seed completado exitosamente!\n');
  console.log('📋 Resumen:');
  console.log('   ── Clínica activa ──');
  console.log('   Slug:   clinica-demo');
  console.log('   Admin:  admin@clinica-demo.com / admin123');
  console.log('   Doctor: dr.rodriguez@clinica-demo.com / doctor123');
  console.log('   Staff:  recepcion@clinica-demo.com / staff123');
  console.log(
    `   Servicios: ${servicios.length} · Pacientes: ${pacientes.length} · Citas: ${citas.length}`,
  );
  console.log('   ── Clínica vencida (prueba bloqueo 402 / renovar) ──');
  console.log('   Slug:   clinica-vencida');
  console.log('   Admin:  admin@clinica-vencida.com / admin123');
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
