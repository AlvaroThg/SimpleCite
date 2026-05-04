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
      email_tenantId: {
        email: 'admin@clinica-demo.com',
        tenantId: tenant.id,
      },
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

  // ─── 3. Doctor ───
  const doctorPassword = await bcrypt.hash('doctor123', SALT_ROUNDS);
  const doctor = await prisma.user.upsert({
    where: {
      email_tenantId: {
        email: 'dr.rodriguez@clinica-demo.com',
        tenantId: tenant.id,
      },
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
  console.log(`  ✅ Doctor: ${doctor.email}`);

  // ─── 4. Staff ───
  const staffPassword = await bcrypt.hash('staff123', SALT_ROUNDS);
  const staff = await prisma.user.upsert({
    where: {
      email_tenantId: {
        email: 'recepcion@clinica-demo.com',
        tenantId: tenant.id,
      },
    },
    update: {},
    create: {
      email: 'recepcion@clinica-demo.com',
      password: staffPassword,
      name: 'María López (Recepción)',
      role: UserRole.STAFF,
      tenantId: tenant.id,
    },
  });
  console.log(`  ✅ Staff: ${staff.email}`);

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

  for (const servicio of servicios) {
    const created = await prisma.service.upsert({
      where: {
        // No hay @@unique en name+tenantId, usamos findFirst + create pattern
        id: (
          await prisma.service.findFirst({
            where: { name: servicio.name, tenantId: tenant.id },
          })
        )?.id ?? 'non-existent-id',
      },
      update: {},
      create: {
        name: servicio.name,
        description: servicio.description,
        price: servicio.price,
        duration: servicio.duration,
        tenantId: tenant.id,
      },
    });
    console.log(`  ✅ Servicio: ${created.name} (Bs ${servicio.price})`);
  }

  console.log('\n🎉 Seed completado exitosamente!');
  console.log(`\n📋 Resumen:`);
  console.log(`   Tenant: ${tenant.slug}`);
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
