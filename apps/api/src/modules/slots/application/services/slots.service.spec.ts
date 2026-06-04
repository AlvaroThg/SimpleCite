import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SlotsService } from './slots.service';

/**
 * Mock de PrismaService: expone `client` con los modelos que usa SlotsService.
 * Cada test configura los retornos.
 */
function makePrismaMock(opts: {
  tenant?: { timezone: string } | null;
  doctorService?: unknown;
  rules?: unknown[];
  blocks?: { startTime: Date; endTime: Date }[];
  appointments?: { startTime: Date; endTime: Date }[];
}) {
  const client = {
    tenant: {
      findFirst: jest.fn().mockResolvedValue(opts.tenant ?? { timezone: 'America/La_Paz' }),
    },
    doctorService: { findFirst: jest.fn().mockResolvedValue(opts.doctorService ?? null) },
    doctorScheduleRule: { findMany: jest.fn().mockResolvedValue(opts.rules ?? []) },
    doctorScheduleBlock: { findMany: jest.fn().mockResolvedValue(opts.blocks ?? []) },
    appointment: { findMany: jest.fn().mockResolvedValue(opts.appointments ?? []) },
  };
  return { client } as never;
}

// Rango futuro de 2 días para evitar el filtro de "pasado".
const FROM = new Date(Date.now() + 30 * 86_400_000);
const TO = new Date(FROM.getTime() + 2 * 86_400_000);
const query = {
  doctorId: 'doc-1',
  serviceId: 'svc-1',
  from: FROM.toISOString(),
  to: TO.toISOString(),
};

// Reglas para los 7 días (8:00–10:00 local), duración 60 → 2 slots/día.
const allDayRules = Array.from({ length: 7 }, (_, d) => ({
  dayOfWeek: d,
  startMinute: 480,
  endMinute: 600,
  isActive: true,
}));
const doctorService = { customDuration: null, service: { duration: 60 } };

describe('SlotsService.generate', () => {
  it('rechaza rango inválido (to <= from)', async () => {
    const svc = new SlotsService(makePrismaMock({}));
    await expect(svc.generate('t1', { ...query, to: FROM.toISOString() })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza rango mayor a 60 días', async () => {
    const svc = new SlotsService(makePrismaMock({}));
    const farTo = new Date(FROM.getTime() + 61 * 86_400_000).toISOString();
    await expect(svc.generate('t1', { ...query, to: farTo })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lanza NotFound si el tenant no existe', async () => {
    const svc = new SlotsService(makePrismaMock({ tenant: null }));
    await expect(svc.generate('t1', query)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza NotFound si el doctor no ofrece el servicio', async () => {
    const svc = new SlotsService(makePrismaMock({ doctorService: null }));
    await expect(svc.generate('t1', query)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('genera slots disponibles con reglas y sin bloqueos', async () => {
    const svc = new SlotsService(makePrismaMock({ doctorService, rules: allDayRules }));
    const slots = await svc.generate('t1', query);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.available)).toBe(true);
    expect(slots[0]).toHaveProperty('startTime');
    expect(slots[0]).toHaveProperty('endTime');
  });

  it('marca slots no disponibles cuando un bloqueo cubre todo el rango', async () => {
    const fullBlock = [
      {
        startTime: new Date(FROM.getTime() - 86_400_000),
        endTime: new Date(TO.getTime() + 86_400_000),
      },
    ];
    const svc = new SlotsService(
      makePrismaMock({ doctorService, rules: allDayRules, blocks: fullBlock }),
    );
    const slots = await svc.generate('t1', query);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => !s.available)).toBe(true);
  });

  it('marca slots ocupados cuando una cita cubre todo el rango', async () => {
    const fullAppt = [
      {
        startTime: new Date(FROM.getTime() - 86_400_000),
        endTime: new Date(TO.getTime() + 86_400_000),
      },
    ];
    const svc = new SlotsService(
      makePrismaMock({ doctorService, rules: allDayRules, appointments: fullAppt }),
    );
    const slots = await svc.generate('t1', query);
    expect(slots.every((s) => !s.available)).toBe(true);
  });

  it('respeta customDuration del DoctorService', async () => {
    const svc30 = new SlotsService(
      makePrismaMock({
        doctorService: { customDuration: 30, service: { duration: 60 } },
        rules: allDayRules,
      }),
    );
    const svc60 = new SlotsService(
      makePrismaMock({
        doctorService: { customDuration: null, service: { duration: 60 } },
        rules: allDayRules,
      }),
    );
    const slots30 = await svc30.generate('t1', query);
    const slots60 = await svc60.generate('t1', query);
    // 30 min → el doble de slots que 60 min en la misma ventana.
    expect(slots30.length).toBeGreaterThan(slots60.length);
  });
});
