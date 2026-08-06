import { ForbiddenException } from '@nestjs/common';
import { AppointmentsService, assertOwnDoctor } from './appointments.service';
import { ScheduleService } from '../../../schedule/application/services/schedule.service';

/**
 * Regresión del aislamiento entre especialistas de UNA MISMA clínica.
 *
 * SimpleCite es para clínicas con varios especialistas: el aislamiento por
 * tenant no alcanza. Un DOCTOR no puede leer ni tocar lo de un colega aunque
 * compartan tenant, y la única entrada que tiene para intentarlo es mandar el
 * `doctorId` / `id` de otro por query, path o body.
 *
 * Estas pruebas fallan si alguien quita el scoping sin querer. Cada caso ataca
 * por el parámetro que el cliente controla — no por el rol, que ya cubre
 * RolesGuard.
 */

const DR_A = 'doctor-a';
const DR_B = 'doctor-b';
const TENANT = 'clinica-1';

const asDoctorA = { userId: DR_A, role: 'DOCTOR' };
const asAdmin = { userId: 'admin-1', role: 'ADMIN' };
const asStaff = { userId: 'staff-1', role: 'STAFF' };

const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() } as never;
const messaging = { sendAppointmentConfirmation: jest.fn() } as never;

// ─────────────────────────────────────────────────────────────
// Helper compartido: la garantía en una sola función
// ─────────────────────────────────────────────────────────────

describe('assertOwnDoctor — la regla de aislamiento entre especialistas', () => {
  it('deja pasar al DOCTOR sobre su propia cita', () => {
    expect(() => assertOwnDoctor(asDoctorA, DR_A, 'ver')).not.toThrow();
  });

  it('bloquea al DOCTOR sobre la cita de un colega', () => {
    expect(() => assertOwnDoctor(asDoctorA, DR_B, 'ver')).toThrow(ForbiddenException);
  });

  it('no restringe a ADMIN ni a STAFF (orquestan toda la clínica)', () => {
    expect(() => assertOwnDoctor(asAdmin, DR_B, 'ver')).not.toThrow();
    expect(() => assertOwnDoctor(asStaff, DR_B, 'ver')).not.toThrow();
  });

  it('sin requester (llamada interna: cron, bot) no restringe', () => {
    expect(() => assertOwnDoctor(undefined, DR_B, 'ver')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// Citas
// ─────────────────────────────────────────────────────────────

function apptPrisma(appointment: Record<string, unknown> | null) {
  const update = jest.fn().mockResolvedValue({ id: 'a1' });
  const client = {
    appointment: { findFirst: jest.fn().mockResolvedValue(appointment), update },
  };
  return { svc: new AppointmentsService({ client } as never, messaging, logger), update };
}

describe('AppointmentsService — un DOCTOR no opera sobre citas ajenas', () => {
  it('transitionStatus: no puede completar la cita de otro especialista', async () => {
    const { svc, update } = apptPrisma({
      id: 'a1',
      status: 'CONFIRMED',
      doctorId: DR_B,
      medicalRecord: { id: 'r1' },
    });
    await expect(
      svc.transitionStatus(TENANT, 'a1', 'COMPLETED' as never, { requester: asDoctorA }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('transitionStatus: no puede cancelar la cita de otro especialista', async () => {
    const { svc, update } = apptPrisma({ id: 'a1', status: 'CONFIRMED', doctorId: DR_B });
    await expect(
      svc.transitionStatus(TENANT, 'a1', 'CANCELLED' as never, { requester: asDoctorA }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('transitionStatus: sí puede sobre la suya', async () => {
    const { svc, update } = apptPrisma({
      id: 'a1',
      status: 'CONFIRMED',
      doctorId: DR_A,
      medicalRecord: { id: 'r1' },
    });
    await svc.transitionStatus(TENANT, 'a1', 'COMPLETED' as never, { requester: asDoctorA });
    expect(update).toHaveBeenCalled();
  });

  it('transitionStatus: STAFF sí puede sobre la cita de cualquier especialista', async () => {
    const { svc, update } = apptPrisma({
      id: 'a1',
      status: 'CONFIRMED',
      doctorId: DR_B,
      medicalRecord: { id: 'r1' },
    });
    await svc.transitionStatus(TENANT, 'a1', 'COMPLETED' as never, { requester: asStaff });
    expect(update).toHaveBeenCalled();
  });

  it('markPaid: no puede registrar el cobro de una cita ajena', async () => {
    const { svc, update } = apptPrisma({
      id: 'a1',
      status: 'CONFIRMED',
      isPaid: false,
      paymentMethod: 'CASH',
      doctorId: DR_B,
    });
    await expect(svc.markPaid(TENANT, 'a1', 'CASH', asDoctorA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('markPaid: sí puede sobre la suya', async () => {
    const { svc, update } = apptPrisma({
      id: 'a1',
      status: 'CONFIRMED',
      isPaid: false,
      paymentMethod: 'CASH',
      doctorId: DR_A,
    });
    await svc.markPaid(TENANT, 'a1', 'CASH', asDoctorA);
    expect(update).toHaveBeenCalled();
  });

  it('create: no puede agendar en la agenda de otro especialista', async () => {
    const { svc } = apptPrisma(null);
    await expect(svc.create(TENANT, { doctorId: DR_B } as never, asDoctorA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('el scoping se decide por el requester del JWT, no por lo que mande el cliente', async () => {
    // Mismo payload, distinto requester: la diferencia la hace el JWT.
    const { svc, update } = apptPrisma({
      id: 'a1',
      status: 'CONFIRMED',
      doctorId: DR_B,
      medicalRecord: { id: 'r1' },
    });
    await svc.transitionStatus(TENANT, 'a1', 'COMPLETED' as never, { requester: asAdmin });
    expect(update).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// Agenda (reglas semanales y bloqueos)
// ─────────────────────────────────────────────────────────────

function schedulePrisma(block?: { id: string; doctorId: string } | null) {
  const deleteFn = jest.fn().mockResolvedValue({});
  const createMany = jest.fn().mockResolvedValue({});
  const deleteMany = jest.fn().mockResolvedValue({});
  const createBlock = jest.fn().mockResolvedValue({ id: 'b1' });
  const client = {
    user: { findFirst: jest.fn().mockResolvedValue({ id: DR_B }) },
    doctorScheduleRule: { findMany: jest.fn().mockResolvedValue([]), createMany, deleteMany },
    doctorScheduleBlock: {
      findFirst: jest.fn().mockResolvedValue(block ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      create: createBlock,
      delete: deleteFn,
    },
  };
  const prisma = {
    client,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  };
  return { svc: new ScheduleService(prisma as never), deleteFn, createMany, createBlock };
}

describe('ScheduleService — un DOCTOR no toca la agenda de un colega', () => {
  it('replaceRules: no puede reescribir el horario semanal de otro', async () => {
    const { svc, createMany } = schedulePrisma();
    await expect(
      svc.replaceRules(TENANT, DR_B, { rules: [] } as never, asDoctorA),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('replaceRules: sí puede sobre el suyo', async () => {
    const { svc } = schedulePrisma();
    await expect(
      svc.replaceRules(TENANT, DR_A, { rules: [] } as never, asDoctorA),
    ).resolves.toBeDefined();
  });

  it('replaceRules: el ADMIN sí administra la agenda de todo el equipo', async () => {
    const { svc } = schedulePrisma();
    await expect(
      svc.replaceRules(TENANT, DR_B, { rules: [] } as never, asAdmin),
    ).resolves.toBeDefined();
  });

  it('createBlock: no puede bloquear horas en la agenda de otro', async () => {
    const { svc, createBlock } = schedulePrisma();
    await expect(
      svc.createBlock(
        TENANT,
        DR_B,
        { startTime: '2026-01-01T10:00:00Z', endTime: '2026-01-01T12:00:00Z' } as never,
        asDoctorA,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createBlock).not.toHaveBeenCalled();
  });

  it('deleteBlock: no puede borrar el bloqueo (vacaciones) de otro', async () => {
    // La ruta es /schedule/blocks/:blockId — sin doctorId visible. El dueño se
    // resuelve leyendo el bloqueo, así que el scoping tiene que ser server-side.
    const { svc, deleteFn } = schedulePrisma({ id: 'b1', doctorId: DR_B });
    await expect(svc.deleteBlock(TENANT, 'b1', asDoctorA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('deleteBlock: sí puede borrar el suyo', async () => {
    const { svc, deleteFn } = schedulePrisma({ id: 'b1', doctorId: DR_A });
    await svc.deleteBlock(TENANT, 'b1', asDoctorA);
    expect(deleteFn).toHaveBeenCalled();
  });
});
