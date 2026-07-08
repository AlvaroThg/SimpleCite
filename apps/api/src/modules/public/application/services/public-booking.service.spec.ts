import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PublicBookingService } from './public-booking.service';

/**
 * Tests del flujo público de reserva (el camino más importante del producto):
 * creación TENTATIVE (anti-bot, rate limit, precio congelado, regresante por
 * CI) y confirmación (titularidad, expiración, efectivo→PENDING_PAYMENT en
 * modo abierto, seguro→CONFIRMED con snapshot inmutable).
 */

const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;

type Overrides = Partial<{
  turnstileOk: boolean;
  requireOtp: boolean;
  recentBookings: number;
  doctor: unknown;
  service: unknown;
  link: unknown;
  patientById: unknown;
  appointment: unknown;
  doctorProfile: unknown;
  insurance: unknown;
  createThrows: unknown;
}>;

function makeHarness(o: Overrides = {}) {
  const created = { id: 'appt-1', expiresAt: new Date(Date.now() + 15 * 60_000) };
  const appointmentCreate = jest.fn().mockImplementation(() => {
    if (o.createThrows) return Promise.reject(o.createThrows);
    return Promise.resolve(created);
  });
  const appointmentUpdate = jest
    .fn()
    .mockImplementation(({ data }) => Promise.resolve({ id: 'appt-1', ...data }));

  const prisma = {
    client: {
      patient: { findFirst: jest.fn().mockResolvedValue(o.patientById ?? null) },
      user: {
        findFirst: jest.fn().mockResolvedValue(o.doctor === undefined ? { id: 'doc-1' } : o.doctor),
      },
      service: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            o.service === undefined ? { id: 'svc-1', duration: 30, price: 100 } : o.service,
          ),
      },
      doctorService: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            o.link === undefined ? { customDuration: null, customPrice: 150 } : o.link,
          ),
      },
      appointment: {
        count: jest.fn().mockResolvedValue(o.recentBookings ?? 0),
        create: appointmentCreate,
        findFirst: jest.fn().mockResolvedValue(o.appointment ?? null),
        update: appointmentUpdate,
      },
      doctorProfile: { findFirst: jest.fn().mockResolvedValue(o.doctorProfile ?? null) },
      tenantInsurance: { findFirst: jest.fn().mockResolvedValue(o.insurance ?? null) },
      bookingNotification: { upsert: jest.fn().mockResolvedValue({}) },
      tenant: { findUnique: jest.fn().mockResolvedValue({ slug: 't', staticQrUrl: null }) },
    },
  } as never;

  const config = {
    get: (key: string) => {
      if (key === 'PUBLIC_BOOKING_REQUIRE_OTP') return o.requireOtp ? 'true' : 'false';
      if (key === 'TENTATIVE_APPOINTMENT_TTL_MINUTES') return 15;
      return undefined;
    },
  } as never;

  const turnstile = { verify: jest.fn().mockResolvedValue(o.turnstileOk ?? true) } as never;
  const patients = {
    findOrCreate: jest.fn().mockResolvedValue({ id: 'pat-1' }),
  } as never;

  const svc = new PublicBookingService(prisma, config, turnstile, patients, null, logger);
  return { svc, appointmentCreate, appointmentUpdate, patients, prisma };
}

const baseDto = {
  doctorId: 'doc-1',
  serviceId: 'svc-1',
  startTime: new Date(Date.now() + 86_400_000).toISOString(), // mañana
  patient: { name: 'Juan Pérez' },
} as never;

describe('PublicBookingService.createTentative', () => {
  it('rechaza cuando Turnstile (anti-bot) falla', async () => {
    const { svc } = makeHarness({ turnstileOk: false });
    await expect(
      svc.createTentative({ tenantId: 't1', phone: '59170000000', dto: baseDto }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('aplica rate limit: 429 al exceder reservas por teléfono/hora', async () => {
    const { svc } = makeHarness({ recentBookings: 5 });
    await expect(
      svc.createTentative({ tenantId: 't1', phone: '59170000000', dto: baseDto }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('rechaza reservas en el pasado', async () => {
    const { svc } = makeHarness();
    const dto = { ...baseDto, startTime: new Date(Date.now() - 3_600_000).toISOString() };
    await expect(
      svc.createTentative({ tenantId: 't1', phone: '59170000000', dto: dto as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404 si el doctor no existe o no pertenece al tenant', async () => {
    const { svc } = makeHarness({ doctor: null });
    await expect(
      svc.createTentative({ tenantId: 't1', phone: '59170000000', dto: baseDto }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea TENTATIVE congelando el precio (override del doctor gana al catálogo)', async () => {
    const { svc, appointmentCreate } = makeHarness(); // customPrice 150 vs service 100
    const res = await svc.createTentative({ tenantId: 't1', phone: '59170000000', dto: baseDto });
    expect(res.appointmentId).toBe('appt-1');
    expect(appointmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'TENTATIVE', price: 150, tenantId: 't1' }),
      }),
    );
  });

  it('regresante por CI: usa su registro y NO pide crear paciente', async () => {
    const { svc, patients, appointmentCreate } = makeHarness({
      patientById: { id: 'pat-9', phone: '59171111111' },
    });
    const dto = { ...baseDto, patientId: 'pat-9', patient: undefined };
    await svc.createTentative({ tenantId: 't1', phone: '', dto: dto as never });
    expect((patients as { findOrCreate: jest.Mock }).findOrCreate).not.toHaveBeenCalled();
    expect(appointmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ patientId: 'pat-9' }) }),
    );
  });

  it('traduce la violación del exclusion constraint (solape) a 409', async () => {
    const { svc } = makeHarness({
      createThrows: Object.assign(new Error('23P01 exclusion'), { message: 'error 23P01' }),
    });
    await expect(
      svc.createTentative({ tenantId: 't1', phone: '59170000000', dto: baseDto }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PublicBookingService.confirm', () => {
  const tentative = (extra: Record<string, unknown> = {}) => ({
    id: 'appt-1',
    patientId: 'pat-1',
    doctorId: 'doc-1',
    status: 'TENTATIVE',
    expiresAt: new Date(Date.now() + 10 * 60_000),
    patient: { phone: '59170000000' },
    ...extra,
  });

  it('rechaza confirmar una reserva ajena (phone distinto)', async () => {
    const { svc } = makeHarness({ appointment: tentative() });
    await expect(
      svc.confirm({
        tenantId: 't1',
        phone: '59179999999',
        appointmentId: 'appt-1',
        paymentMethod: 'CASH',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('expira la reserva vencida (la cancela y avisa)', async () => {
    const { svc, appointmentUpdate } = makeHarness({
      appointment: tentative({ expiresAt: new Date(Date.now() - 1000) }),
    });
    await expect(
      svc.confirm({
        tenantId: 't1',
        phone: '59170000000',
        appointmentId: 'appt-1',
        paymentMethod: 'CASH',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(appointmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
  });

  it('modo abierto (sin bot): efectivo queda PENDING_PAYMENT (staff confirma a mano)', async () => {
    const { svc } = makeHarness({ appointment: tentative() });
    const res = (await svc.confirm({
      tenantId: 't1',
      phone: '59170000000',
      appointmentId: 'appt-1',
      paymentMethod: 'CASH',
    })) as { status: string };
    expect(res.status).toBe('PENDING_PAYMENT');
  });

  it('seguro: rechaza si el doctor no está en modo seguro', async () => {
    const { svc } = makeHarness({ appointment: tentative(), doctorProfile: null });
    await expect(
      svc.confirm({
        tenantId: 't1',
        phone: '59170000000',
        appointmentId: 'appt-1',
        paymentMethod: 'INSURANCE',
        tenantInsuranceId: 'ins-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('seguro: rechaza un seguro no asignado al doctor (422)', async () => {
    const { svc } = makeHarness({
      appointment: tentative(),
      doctorProfile: { id: 'dp-1' },
      insurance: null,
    });
    await expect(
      svc.confirm({
        tenantId: 't1',
        phone: '59170000000',
        appointmentId: 'appt-1',
        paymentMethod: 'INSURANCE',
        tenantInsuranceId: 'ins-1',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('seguro válido: CONFIRMED directo con snapshot inmutable del nombre', async () => {
    const { svc } = makeHarness({
      appointment: tentative(),
      doctorProfile: { id: 'dp-1' },
      insurance: { id: 'ins-1', name: 'Univida' },
    });
    const res = (await svc.confirm({
      tenantId: 't1',
      phone: '59170000000',
      appointmentId: 'appt-1',
      paymentMethod: 'INSURANCE',
      tenantInsuranceId: 'ins-1',
    })) as { status: string; insuranceNameSnapshot: string };
    expect(res.status).toBe('CONFIRMED');
    expect(res.insuranceNameSnapshot).toBe('Univida');
  });
});
