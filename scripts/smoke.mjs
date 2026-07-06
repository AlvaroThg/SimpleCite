#!/usr/bin/env node
/**
 * Smoke test del flujo crítico de SimpleCite contra un API corriendo.
 *
 * Ejercita de punta a punta: salud → tenant público → doctores → disponibilidad
 * → crear reserva → confirmar (efectivo) → login staff → verla en el panel →
 * confirmar pago → cancelarla (limpieza).
 *
 * Uso:
 *   node scripts/smoke.mjs <slug> [apiUrl]
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/smoke.mjs regenera-fisioterapia
 *
 * Sin credenciales de admin corre solo la parte pública (no limpia la reserva).
 * Pensado para correrse antes de un deploy o después de levantar el stack.
 */

const slug = process.argv[2];
const BASE = process.argv[3] ?? process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!slug) {
  console.error('Uso: node scripts/smoke.mjs <slug> [apiUrl]');
  process.exit(1);
}

let failures = 0;
function ok(name, extra = '') {
  console.log(`  ✔ ${name}${extra ? ` — ${extra}` : ''}`);
}
function fail(name, err) {
  failures++;
  console.error(`  ✘ ${name}: ${err}`);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body?.message ?? res.statusText}`);
  return body?.data ?? body;
}

console.log(`Smoke test → ${BASE} (slug: ${slug})\n`);

try {
  // 1. Salud del API
  await api('/api/health');
  ok('API /health');

  // 2. Tenant público
  const tenant = await api(`/api/public/tenants/${slug}`);
  ok('tenant público', tenant.name);

  // 3. Doctores con servicios
  const doctors = await api(`/api/public/tenants/${slug}/doctors`);
  const doctor = doctors.find((d) => d.doctorServices?.length > 0);
  if (!doctor) throw new Error('ningún doctor con servicios activos');
  const service = doctor.doctorServices[0].service;
  ok('doctores públicos', `${doctors.length} doctores; probando con ${doctor.name}`);

  // 4. Disponibilidad (próximos 14 días)
  const from = new Date();
  const to = new Date(Date.now() + 14 * 86_400_000);
  const slots = await api(
    `/api/public/tenants/${slug}/availability?doctorId=${doctor.id}&serviceId=${service.id}` +
      `&from=${from.toISOString()}&to=${to.toISOString()}`,
  );
  const free = slots.find((s) => s.available);
  if (!free) throw new Error('sin slots disponibles en 14 días (¿horarios configurados?)');
  ok('disponibilidad', `${slots.length} slots, primero libre: ${free.startTime}`);

  // 5. Crear reserva (paciente de humo, teléfono fijo para dedupe)
  const phone = '59171000001';
  const booking = await api(`/api/public/tenants/${slug}/appointments`, {
    method: 'POST',
    body: JSON.stringify({
      doctorId: doctor.id,
      serviceId: service.id,
      startTime: free.startTime,
      phone,
      patient: { name: 'Smoke Test', ci: '9999999' },
    }),
  });
  ok('reserva TENTATIVE creada', booking.appointmentId);

  // 6. Confirmar en efectivo → PENDING_PAYMENT (modo abierto)
  await api(`/api/public/tenants/${slug}/appointments/${booking.appointmentId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ paymentMethod: 'CASH', phone }),
  });
  ok('reserva confirmada (efectivo)');

  // 7. Lookup de paciente regresante por CI
  const lookup = await api(`/api/public/tenants/${slug}/patients/lookup?ci=9999999`);
  if (!lookup.found) throw new Error('lookup por CI no encontró al paciente recién creado');
  ok('lookup por CI', lookup.firstName);

  // ── Parte de panel (requiere credenciales) ──
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log('\n(sin ADMIN_EMAIL/ADMIN_PASSWORD: se omite panel y limpieza)');
  } else {
    const login = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'x-tenant-slug': slug },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const auth = { Authorization: `Bearer ${login.accessToken}`, 'x-tenant-slug': slug };
    ok('login staff', login.user.name);

    const pending = await api('/api/appointments?status=PENDING_PAYMENT', { headers: auth });
    const mine = pending.find((a) => a.id === booking.appointmentId);
    if (!mine) throw new Error('la reserva no aparece en Pendientes de pago del panel');
    ok('reserva visible en el panel');

    await api(`/api/appointments/${booking.appointmentId}/status`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ status: 'CONFIRMED' }),
    });
    ok('pago confirmado por staff (PENDING_PAYMENT → CONFIRMED)');

    // Limpieza: cancelar la cita de humo para liberar el slot.
    await api(`/api/appointments/${booking.appointmentId}/status`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ status: 'CANCELLED' }),
    });
    ok('limpieza: cita de humo cancelada');
  }
} catch (err) {
  fail('flujo', err.message);
}

console.log(failures === 0 ? '\n✅ Smoke test OK' : `\n❌ Smoke test con ${failures} fallo(s)`);
process.exit(failures === 0 ? 0 : 1);
