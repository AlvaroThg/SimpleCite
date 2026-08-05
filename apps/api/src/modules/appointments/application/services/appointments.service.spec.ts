import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AppointmentsService, occurrenceDates } from './appointments.service';

// Stubs de dependencias no usadas por transitionStatus.
const waCloud = { sendAppointmentConfirmation: jest.fn() } as never;
const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() } as never;

function makePrisma(
  current: { id: string; status: string; medicalRecord?: { id: string } | null } | null,
) {
  const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'a1', ...data }));
  const client = {
    appointment: {
      findFirst: jest.fn().mockResolvedValue(current),
      update,
    },
  };
  return { prisma: { client } as never, update };
}

describe('AppointmentsService.transitionStatus (máquina de estados)', () => {
  it('permite PENDING_PAYMENT → CONFIRMED y marca isPaid', async () => {
    const { prisma, update } = makePrisma({ id: 'a1', status: 'PENDING_PAYMENT' });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await svc.transitionStatus('t1', 'a1', 'CONFIRMED' as never);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CONFIRMED', isPaid: true }),
      }),
    );
  });

  it('permite TENTATIVE → PENDING_PAYMENT', async () => {
    const { prisma, update } = makePrisma({ id: 'a1', status: 'TENTATIVE' });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await svc.transitionStatus('t1', 'a1', 'PENDING_PAYMENT' as never);
    expect(update).toHaveBeenCalled();
  });

  it('rechaza transición inválida PENDING_PAYMENT → COMPLETED', async () => {
    const { prisma } = makePrisma({ id: 'a1', status: 'PENDING_PAYMENT' });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await expect(svc.transitionStatus('t1', 'a1', 'COMPLETED' as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza transición desde estado terminal (CANCELLED)', async () => {
    const { prisma } = makePrisma({ id: 'a1', status: 'CANCELLED' });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await expect(svc.transitionStatus('t1', 'a1', 'CONFIRMED' as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lanza NotFound si la cita no existe (aislamiento por tenant)', async () => {
    const { prisma } = makePrisma(null);
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await expect(
      svc.transitionStatus('t1', 'missing', 'CONFIRMED' as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AppointmentsService.transitionStatus — completar exige consulta', () => {
  it('rechaza CONFIRMED → COMPLETED sin historia clínica', async () => {
    const { prisma, update } = makePrisma({ id: 'a1', status: 'CONFIRMED', medicalRecord: null });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await expect(svc.transitionStatus('t1', 'a1', 'COMPLETED' as never)).rejects.toThrow(
      /consulta registrada/i,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('permite completar cuando la consulta ya está registrada', async () => {
    const { prisma, update } = makePrisma({
      id: 'a1',
      status: 'CONFIRMED',
      medicalRecord: { id: 'r1' },
    });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await svc.transitionStatus('t1', 'a1', 'COMPLETED' as never);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('force: completa sin consulta (citas que no la llevan)', async () => {
    const { prisma, update } = makePrisma({ id: 'a1', status: 'CONFIRMED', medicalRecord: null });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await svc.transitionStatus('t1', 'a1', 'COMPLETED' as never, { force: true });
    expect(update).toHaveBeenCalled();
  });

  it('el guard no afecta otras transiciones (cancelar sin consulta)', async () => {
    const { prisma, update } = makePrisma({ id: 'a1', status: 'CONFIRMED', medicalRecord: null });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await svc.transitionStatus('t1', 'a1', 'CANCELLED' as never);
    expect(update).toHaveBeenCalled();
  });
});

// ─── cancelByToken (magic link público) ───
type CancelAppt = {
  id: string;
  status: string;
  startTime: Date;
  tenant: { name: string };
  doctor: { name: string };
  service: { name: string };
} | null;

function makeCancelPrisma(found: CancelAppt) {
  const update = jest.fn().mockResolvedValue({});
  const client = {
    appointment: {
      findUnique: jest.fn().mockResolvedValue(found),
      update,
    },
  };
  return { prisma: { client } as never, update };
}

const baseCancelAppt = {
  id: 'a1',
  startTime: new Date('2030-01-01T10:00:00Z'),
  tenant: { name: 'Clínica X' },
  doctor: { name: 'Dra. Ruiz' },
  service: { name: 'Consulta' },
};

describe('AppointmentsService.cancelByToken', () => {
  it('lanza NotFound si el token no corresponde a ninguna cita', async () => {
    const { prisma } = makeCancelPrisma(null);
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await expect(svc.cancelByToken('tok')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('es idempotente: si ya está CANCELLED devuelve alreadyCancelled sin update', async () => {
    const { prisma, update } = makeCancelPrisma({ ...baseCancelAppt, status: 'CANCELLED' });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    const res = await svc.cancelByToken('tok');
    expect(res.alreadyCancelled).toBe(true);
    expect(res.status).toBe('CANCELLED');
    expect(update).not.toHaveBeenCalled();
  });

  it('rechaza cancelar una cita ya atendida (COMPLETED)', async () => {
    const { prisma } = makeCancelPrisma({ ...baseCancelAppt, status: 'COMPLETED' });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await expect(svc.cancelByToken('tok')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancela una CONFIRMED: pone CANCELLED y libera el slot (expiresAt null)', async () => {
    const { prisma, update } = makeCancelPrisma({ ...baseCancelAppt, status: 'CONFIRMED' });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    const res = await svc.cancelByToken('tok');
    expect(res.alreadyCancelled).toBe(false);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED', expiresAt: null }),
      }),
    );
  });
});

// ─── reschedule (drag&drop / resize) ───
function makeReschedulePrisma(
  current: { id: string; status: string; doctorId: string } | null,
  updateImpl?: () => Promise<unknown>,
) {
  const update = jest.fn(updateImpl ?? (({ data }: { data: unknown }) => Promise.resolve(data)));
  const client = {
    appointment: {
      findFirst: jest.fn().mockResolvedValue(current),
      update,
    },
    // Sin reglas de horario cargadas la validación de agenda no aplica: estos
    // casos prueban otras reglas (estado, pasado, solape), no el horario.
    tenant: { findUnique: jest.fn().mockResolvedValue({ timezone: 'America/La_Paz' }) },
    doctorScheduleRule: { findMany: jest.fn().mockResolvedValue([]) },
    doctorScheduleBlock: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  return { prisma: { client } as never, update };
}

const future = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe('AppointmentsService.reschedule', () => {
  it('rechaza reprogramar al pasado', async () => {
    const { prisma } = makeReschedulePrisma({ id: 'a1', status: 'CONFIRMED', doctorId: 'd1' });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await expect(
      svc.reschedule('t1', 'a1', { startTime: future(-3_600_000), endTime: future(-1_800_000) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lanza NotFound si la cita no existe', async () => {
    const { prisma } = makeReschedulePrisma(null);
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await expect(
      svc.reschedule('t1', 'a1', { startTime: future(3_600_000), endTime: future(5_400_000) }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un DOCTOR no puede reprogramar citas de otro doctor', async () => {
    const { prisma } = makeReschedulePrisma({ id: 'a1', status: 'CONFIRMED', doctorId: 'otro' });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await expect(
      svc.reschedule(
        't1',
        'a1',
        { startTime: future(3_600_000), endTime: future(5_400_000) },
        { userId: 'd1', role: 'DOCTOR' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza reprogramar una cita en estado terminal', async () => {
    const { prisma } = makeReschedulePrisma({ id: 'a1', status: 'COMPLETED', doctorId: 'd1' });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await expect(
      svc.reschedule('t1', 'a1', { startTime: future(3_600_000), endTime: future(5_400_000) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reprograma una CONFIRMED y persiste el nuevo horario', async () => {
    const { prisma, update } = makeReschedulePrisma({
      id: 'a1',
      status: 'CONFIRMED',
      doctorId: 'd1',
    });
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await svc.reschedule('t1', 'a1', {
      startTime: future(3_600_000),
      endTime: future(5_400_000),
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ startTime: expect.any(Date), endTime: expect.any(Date) }),
      }),
    );
  });

  it('traduce el solape (exclusion constraint 23P01) a 409 Conflict', async () => {
    const { prisma } = makeReschedulePrisma({ id: 'a1', status: 'CONFIRMED', doctorId: 'd1' }, () =>
      Promise.reject({ code: 'P2010', meta: { code: '23P01' } }),
    );
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await expect(
      svc.reschedule('t1', 'a1', { startTime: future(3_600_000), endTime: future(5_400_000) }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AppointmentsService.findAll — ventana por defecto', () => {
  function makeListPrisma() {
    const findMany = jest.fn().mockResolvedValue([]);
    return { prisma: { client: { appointment: { findMany } } } as never, findMany };
  }

  it('una cita a 3 semanas (alcance del bot) entra en la ventana por defecto', async () => {
    const { prisma, findMany } = makeListPrisma();
    const svc = new AppointmentsService(prisma, waCloud, logger);
    await svc.findAll('t1', {});

    const { startTime } = findMany.mock.calls[0][0].where as {
      startTime: { gte: Date; lte: Date };
    };
    const enTresSemanas = new Date(Date.now() + 21 * 86_400_000);
    // Antes la ventana era +15 días: la cita existía pero no salía ni en la
    // lista ni en el calendario, solo entrando al paciente.
    expect(startTime.lte.getTime()).toBeGreaterThan(enTresSemanas.getTime());
  });

  it('un rango explícito manda sobre la ventana por defecto', async () => {
    const { prisma, findMany } = makeListPrisma();
    const svc = new AppointmentsService(prisma, waCloud, logger);
    const from = new Date('2027-01-01T00:00:00Z');
    const to = new Date('2027-01-31T23:59:59Z');
    await svc.findAll('t1', { from, to });

    const { startTime } = findMany.mock.calls[0][0].where as {
      startTime: { gte: Date; lte: Date };
    };
    expect(startTime.gte).toBe(from);
    expect(startTime.lte).toBe(to);
  });
});

describe('AppointmentsService.reschedule — respeta el horario del doctor', () => {
  /** Lunes 2030-05-06, 10:00–11:00 en La Paz (UTC-4) → 14:00–15:00 UTC. */
  const start = new Date('2030-05-06T14:00:00Z');
  const end = new Date('2030-05-06T15:00:00Z');

  function makeSvc(
    rules: { dayOfWeek: number; startMinute: number; endMinute: number }[],
    block = false,
  ) {
    const update = jest
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ id: 'a1', ...data }));
    const client = {
      appointment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'a1', status: 'CONFIRMED', doctorId: 'doc1' }),
        update,
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ timezone: 'America/La_Paz' }) },
      doctorScheduleRule: { findMany: jest.fn().mockResolvedValue(rules) },
      doctorScheduleBlock: {
        findFirst: jest.fn().mockResolvedValue(block ? { id: 'b1' } : null),
      },
    };
    return { svc: new AppointmentsService({ client } as never, waCloud, logger), update };
  }

  const dto = { startTime: start.toISOString(), endTime: end.toISOString() };
  // Lunes = 1. Atiende 08:00–12:00 (480–720 min).
  const MONDAY_MORNING = [{ dayOfWeek: 1, startMinute: 480, endMinute: 720 }];

  it('permite mover dentro del horario de atención', async () => {
    const { svc, update } = makeSvc(MONDAY_MORNING);
    await svc.reschedule('t1', 'a1', dto);
    expect(update).toHaveBeenCalled();
  });

  it('rechaza mover fuera del horario (el doctor sale a las 12:00)', async () => {
    const { svc, update } = makeSvc([{ dayOfWeek: 1, startMinute: 480, endMinute: 540 }]);
    await expect(svc.reschedule('t1', 'a1', dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rechaza mover a un día en que el doctor no atiende', async () => {
    const { svc, update } = makeSvc([{ dayOfWeek: 3, startMinute: 480, endMinute: 720 }]);
    await expect(svc.reschedule('t1', 'a1', dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rechaza mover sobre un bloqueo del especialista', async () => {
    const { svc, update } = makeSvc(MONDAY_MORNING, true);
    await expect(svc.reschedule('t1', 'a1', dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('sin agenda configurada no bloquea (la clínica aún no cargó horarios)', async () => {
    const { svc, update } = makeSvc([]);
    await svc.reschedule('t1', 'a1', dto);
    expect(update).toHaveBeenCalled();
  });
});

describe('occurrenceDates — fechas del tratamiento', () => {
  // Lunes 3 de agosto de 2026, 09:00 (hora local del runner).
  const monday = new Date(2026, 7, 3, 9, 0, 0);
  const dow = (d: Date) => d.getDay();

  it('lun/mié/vie × 10: crea 10 fechas solo en esos días', () => {
    const out = occurrenceDates(monday, { weekdays: [1, 3, 5], count: 10 });
    expect(out).toHaveLength(10);
    expect(out.every((d) => [1, 3, 5].includes(dow(d)))).toBe(true);
  });

  it('conserva la hora en todas las sesiones', () => {
    const out = occurrenceDates(monday, { weekdays: [1, 3, 5], count: 6 });
    expect(out.every((d) => d.getHours() === 9 && d.getMinutes() === 0)).toBe(true);
  });

  it('la primera cita entra aunque su día no esté marcado (la eligió el usuario)', () => {
    const out = occurrenceDates(monday, { weekdays: [4], count: 3 });
    expect(out[0]).toEqual(monday);
    expect(dow(out[1])).toBe(4);
  });

  it('respeta la fecha límite en vez del conteo', () => {
    const until = new Date(2026, 7, 14, 23, 59).toISOString(); // viernes 14 ago
    const out = occurrenceDates(monday, { weekdays: [1, 3, 5], until });
    expect(out.every((d) => d <= new Date(until))).toBe(true);
    expect(out.length).toBeGreaterThan(1);
  });

  it('no se cuelga si los días marcados nunca alcanzan el conteo', () => {
    // Solo domingos pero pidiendo 60: corta por el barrido de un año.
    const out = occurrenceDates(monday, { weekdays: [0], count: 60 });
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.length).toBeGreaterThan(50);
  });

  it('sin recurrencia semanal útil devuelve al menos la cita ancla', () => {
    const out = occurrenceDates(monday, { weekdays: [1], count: 2 });
    expect(out[0]).toEqual(monday);
  });
});

describe('AppointmentsService.create — tratamiento recurrente', () => {
  const start = new Date(Date.now() + 7 * 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);

  /** @param failOn índices (0-based) de sesiones que chocan con otra cita. */
  function makeSeriesPrisma(failOn: number[] = []) {
    let n = 0;
    const create = jest.fn().mockImplementation(() => {
      const i = n++;
      if (failOn.includes(i)) return Promise.reject({ code: 'P2010', meta: { code: '23P01' } });
      return Promise.resolve({ id: `a${i}`, startTime: start });
    });
    const send = jest.fn().mockResolvedValue(undefined);
    const client = {
      patient: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'doc1' }) },
      doctorService: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'ds1', customPrice: 100, service: { price: 80 } }),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ timezone: 'America/La_Paz' }) },
      doctorScheduleRule: { findMany: jest.fn().mockResolvedValue([]) },
      doctorScheduleBlock: { findFirst: jest.fn().mockResolvedValue(null) },
      appointment: {
        create,
        findFirst: jest.fn().mockResolvedValue({
          id: 'a0',
          status: 'CONFIRMED',
          cancellationToken: 'tok',
          startTime: start,
          patient: { phone: '59170000000', name: 'Ana' },
          doctor: { name: 'Dr. Bryan' },
          tenant: { mapsUrl: null, timezone: 'America/La_Paz' },
        }),
      },
    };
    const messaging = { sendAppointmentConfirmation: send } as never;
    return { svc: new AppointmentsService({ client } as never, messaging, logger), create, send };
  }

  const dto = (recurrence?: object) =>
    ({
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      patientId: 'p1',
      doctorId: 'doc1',
      serviceId: 'svc1',
      paymentMethod: 'CASH',
      ...(recurrence ? { recurrence } : {}),
    }) as never;

  it('crea una cita por sesión, todas con el mismo seriesId', async () => {
    const { svc, create } = makeSeriesPrisma();
    const res = (await svc.create('t1', dto({ weekdays: [1, 3, 5], count: 5 }))) as {
      series: { id: string; created: number };
    };
    expect(create).toHaveBeenCalledTimes(5);
    expect(res.series.created).toBe(5);

    const ids = create.mock.calls.map((c) => c[0].data.seriesId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBeTruthy();
  });

  it('cada sesión lleva su propio token de cancelación', async () => {
    const { svc, create } = makeSeriesPrisma();
    await svc.create('t1', dto({ weekdays: [1, 3, 5], count: 4 }));
    const tokens = create.mock.calls.map((c) => c[0].data.cancellationToken);
    expect(new Set(tokens).size).toBe(4);
  });

  it('una sesión que choca se omite y se informa; las demás se crean', async () => {
    const { svc, create } = makeSeriesPrisma([2]);
    const res = (await svc.create('t1', dto({ weekdays: [1, 3, 5], count: 5 }))) as {
      series: { created: number; skipped: { reason: string }[] };
    };
    expect(create).toHaveBeenCalledTimes(5);
    expect(res.series.created).toBe(4);
    expect(res.series.skipped).toHaveLength(1);
    expect(res.series.skipped[0].reason).toMatch(/ya tiene una cita/i);
  });

  it('avisa al paciente UNA sola vez por tratamiento, no una por sesión', async () => {
    const { svc, send } = makeSeriesPrisma();
    await svc.create('t1', dto({ weekdays: [1, 3, 5], count: 6 }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][5]).toMatchObject({ totalSessions: 6 });
  });

  it('si TODAS las fechas chocan, no deja una serie a medias: 409', async () => {
    const { svc } = makeSeriesPrisma([0, 1, 2]);
    await expect(svc.create('t1', dto({ weekdays: [1], count: 3 }))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('sin recurrencia sigue creando UNA cita suelta (sin seriesId)', async () => {
    const { svc, create } = makeSeriesPrisma();
    await svc.create('t1', dto());
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.seriesId).toBeUndefined();
  });
});
