import { ConversationEngine } from './conversation-engine.service';

/**
 * Specs del motor conversacional: resolución de clínica (deep link /
 * historial / búsqueda), registro por nombre, wizard hasta TENTATIVE y
 * confirmación en efectivo con link de Maps en el cierre.
 */

const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;
const config = { get: jest.fn().mockReturnValue(15) } as never;

const TENANT = {
  id: 't1',
  name: 'Regenera',
  slug: 'regenera',
  status: 'ACTIVE',
  timezone: 'America/La_Paz',
  mapsUrl: 'https://maps.app.goo.gl/abc',
  locationPhotoUrl: 'https://pub.r2.dev/regenera/fachada.jpg',
  heroImageUrl: null,
  qrAssignmentMode: 'SHARED',
  staticQrUrl: 'https://pub.r2.dev/regenera/assets/qr.png',
  staticQrLabel: 'Banco Unión',
};

function makeHarness(opts: {
  visitedTenants?: { id: string; name: string }[];
  patientInTenant?: { name: string } | null;
  conversation?: { step: string; tenantId?: string | null; data?: object };
  slots?: { startTime: string; endTime: string; available: boolean }[];
  appointment?: { id: string; status: string; expiresAt: Date | null; startTime: Date };
  doctors?: { id: string; name: string; doctorProfile: { specialty: string | null } | null }[];
  tenant?: object;
  doctorQr?: { qrUrl: string | null; qrLabel: string | null } | null;
}) {
  const convoRow = {
    id: 'c1',
    channel: 'telegram',
    chatId: '6840926345',
    step: opts.conversation?.step ?? 'IDLE',
    tenantId: opts.conversation?.tenantId ?? null,
    data: opts.conversation?.data ?? {},
    expiresAt: new Date(Date.now() + 60_000),
  };

  const appointmentCreate = jest.fn().mockResolvedValue({ id: 'appt-1' });
  const appointmentUpdate = jest.fn().mockResolvedValue({});
  const convoUpdate = jest.fn().mockResolvedValue(convoRow);

  const client = {
    botConversation: {
      findUnique: jest.fn().mockResolvedValue(convoRow),
      create: jest.fn().mockResolvedValue(convoRow),
      update: convoUpdate,
    },
    patient: {
      findMany: jest
        .fn()
        .mockResolvedValue((opts.visitedTenants ?? []).map((t) => ({ tenant: t }))),
      findFirst: jest.fn().mockResolvedValue(opts.patientInTenant ?? null),
    },
    tenant: {
      findFirst: jest.fn().mockResolvedValue({ ...TENANT, ...(opts.tenant ?? {}) }),
      findUnique: jest.fn().mockResolvedValue({ ...TENANT, ...(opts.tenant ?? {}) }),
      findMany: jest.fn().mockResolvedValue([{ ...TENANT, ...(opts.tenant ?? {}) }]),
    },
    doctorProfile: {
      findMany: jest.fn().mockResolvedValue([{ specialty: 'Fisioterapia' }]),
      findFirst: jest.fn().mockResolvedValue(opts.doctorQr ?? null),
    },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          opts.doctors ?? [
            { id: 'doc1', name: 'Dr. Bryan', doctorProfile: { specialty: 'Fisioterapia' } },
          ],
        ),
      findFirst: jest.fn().mockResolvedValue({ id: 'doc1', name: 'Dr. Bryan' }),
    },
    doctorService: {
      findMany: jest.fn().mockResolvedValue([
        {
          customPrice: null,
          customDuration: null,
          service: { id: 'svc1', name: 'Sesión Fisio', price: '150', duration: 60, isActive: true },
        },
      ]),
    },
    appointment: {
      create: appointmentCreate,
      update: appointmentUpdate,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(
        opts.appointment ?? {
          id: 'appt-1',
          status: 'TENTATIVE',
          expiresAt: new Date(Date.now() + 10 * 60_000),
          startTime: new Date('2030-05-01T14:00:00Z'),
        },
      ),
    },
    bookingNotification: { upsert: jest.fn().mockResolvedValue({}) },
  };

  const slots = {
    generate: jest.fn().mockResolvedValue(
      opts.slots ?? [
        {
          startTime: '2030-05-01T14:00:00.000Z',
          endTime: '2030-05-01T15:00:00.000Z',
          available: true,
        },
        {
          startTime: '2030-05-02T14:00:00.000Z',
          endTime: '2030-05-02T15:00:00.000Z',
          available: true,
        },
      ],
    ),
  } as never;
  const patients = { findOrCreate: jest.fn().mockResolvedValue({ id: 'p1' }) } as never;
  const uploadImage = jest.fn().mockResolvedValue('https://pub.r2.dev/receipts/t1/rec.jpg');
  const storage = { uploadImage } as never;

  const engine = new ConversationEngine(
    { client } as never,
    slots,
    patients,
    storage,
    config,
    logger,
  );
  return { engine, client, appointmentCreate, appointmentUpdate, convoUpdate, uploadImage };
}

const msg = (over: object) => ({ channel: 'telegram' as const, chatId: '6840926345', ...over });

describe('ConversationEngine — resolución de clínica', () => {
  it('nuevo sin historial: pide el nombre de la clínica', async () => {
    const { engine } = makeHarness({ visitedTenants: [] });
    const out = await engine.handle(msg({ text: 'hola' }));
    expect(out[0].text).toContain('qué clínica');
    expect(out[0].buttons).toBeUndefined();
  });

  it('con historial: ofrece las clínicas visitadas + "Otra clínica"', async () => {
    const { engine } = makeHarness({ visitedTenants: [{ id: 't1', name: 'Regenera' }] });
    const out = await engine.handle(msg({ text: 'hola' }));
    const flat = out[0].buttons!.flat();
    expect(flat.some((b) => b.label === 'Regenera' && b.data === 't:t1')).toBe(true);
    expect(flat.some((b) => b.label === 'Otra clínica')).toBe(true);
  });

  it('deep link con slug: entra directo y saluda al paciente recurrente', async () => {
    const { engine } = makeHarness({ patientInTenant: { name: 'Alvaro Baldiviezo' } });
    const out = await engine.handle(msg({ startPayload: 'regenera' }));
    expect(out[0].text).toContain('Hola Alvaro');
    expect(out[0].text).toContain('Regenera');
    expect(out[0].buttons!.flat().some((b) => b.data === 'book')).toBe(true);
    expect(out[0].imageUrl).toBe(TENANT.locationPhotoUrl);
  });

  it('deep link, paciente nuevo en la clínica: pide el nombre completo', async () => {
    const { engine } = makeHarness({ patientInTenant: null });
    const out = await engine.handle(msg({ startPayload: 'regenera' }));
    expect(out[0].text).toContain('nombre completo');
  });
});

describe('ConversationEngine — registro y wizard', () => {
  it('rechaza un nombre sin apellido y lo vuelve a pedir', async () => {
    const { engine } = makeHarness({
      conversation: { step: 'REGISTERING_NAME', tenantId: 't1' },
    });
    const out = await engine.handle(msg({ text: 'Ana' }));
    expect(out[0].text).toContain('nombre y apellido');
  });

  it('con nombre válido avanza al wizard: doctor único se auto-elige, el servicio SIEMPRE se elige', async () => {
    const { engine } = makeHarness({
      conversation: { step: 'REGISTERING_NAME', tenantId: 't1' },
    });
    const out = await engine.handle(msg({ text: 'Ana Fernández' }));
    // 1 doctor → auto; aunque haya 1 solo servicio, el paciente lo confirma.
    expect(out[0].text).toContain('Qué servicio');
    expect(out[0].buttons!.flat().some((b) => b.data === 'sv:svc1')).toBe(true);
  });

  it('con varios doctores lista especialistas con nombre y especialidad', async () => {
    const { engine } = makeHarness({
      conversation: { step: 'MAIN_MENU', tenantId: 't1', data: { name: 'Ana Fernández' } },
      doctors: [
        { id: 'doc1', name: 'Dr. Bryan', doctorProfile: { specialty: 'Fisioterapia' } },
        { id: 'doc2', name: 'Dra. Lupe', doctorProfile: { specialty: 'Estética' } },
      ],
    });
    const out = await engine.handle(msg({ callback: 'book' }));
    const flat = out[0].buttons!.flat();
    expect(flat.some((b) => b.label === 'Dr. Bryan — Fisioterapia' && b.data === 'd:doc1')).toBe(
      true,
    );
    expect(flat.some((b) => b.label === 'Dra. Lupe — Estética')).toBe(true);
  });

  it('elegir horario crea la cita TENTATIVE con precio congelado', async () => {
    const { engine, appointmentCreate } = makeHarness({
      conversation: {
        step: 'CHOOSING_SLOT',
        tenantId: 't1',
        data: {
          name: 'Ana Fernández',
          doctorId: 'doc1',
          doctorName: 'Dr. Bryan',
          serviceId: 'svc1',
          serviceName: 'Sesión Fisio',
          price: '150',
          durationMin: 60,
          dayIso: '2030-05-01',
        },
      },
    });
    const out = await engine.handle(msg({ callback: 'slot:2030-05-01T14:00:00.000Z' }));
    expect(appointmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'TENTATIVE', price: '150', tenantId: 't1' }),
      }),
    );
    expect(out[0].text).toContain('Bs 150');
    expect(out[0].buttons!.flat().some((b) => b.data === 'pay:cash')).toBe(true);
  });

  it('slot ocupado en la carrera (23P01): reofrece horarios sin romper', async () => {
    const { engine, appointmentCreate } = makeHarness({
      conversation: {
        step: 'CHOOSING_SLOT',
        tenantId: 't1',
        data: {
          name: 'Ana Fernández',
          doctorId: 'doc1',
          serviceId: 'svc1',
          price: '150',
          durationMin: 60,
          dayIso: '2030-05-01',
        },
      },
    });
    appointmentCreate.mockRejectedValueOnce(new Error('violates exclusion constraint 23P01'));
    const out = await engine.handle(msg({ callback: 'slot:2030-05-01T14:00:00.000Z' }));
    expect(out[0].text).toContain('se acaba de ocupar');
  });
});

describe('ConversationEngine — pago en efectivo y cierre', () => {
  const paymentConvo = {
    step: 'CHOOSING_PAYMENT',
    tenantId: 't1',
    data: {
      name: 'Ana Fernández',
      doctorName: 'Dr. Bryan',
      serviceName: 'Sesión Fisio',
      price: '150',
      appointmentId: 'appt-1',
    },
  };

  it('efectivo confirma la cita y cierra con el link de Maps del tenant', async () => {
    const { engine, appointmentUpdate } = makeHarness({ conversation: paymentConvo });
    const out = await engine.handle(msg({ callback: 'pay:cash' }));
    expect(appointmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CONFIRMED', paymentMethod: 'CASH' }),
      }),
    );
    expect(out[0].text).toContain('Gracias Ana');
    expect(out[0].text).toContain('Dr. Bryan');
    expect(out[0].text).toContain('https://maps.app.goo.gl/abc');
  });

  it('la TENTATIVE expirada no se confirma: se cancela y pide reintentar', async () => {
    const { engine, appointmentUpdate } = makeHarness({
      conversation: paymentConvo,
      appointment: {
        id: 'appt-1',
        status: 'TENTATIVE',
        expiresAt: new Date(Date.now() - 1000),
        startTime: new Date('2030-05-01T14:00:00Z'),
      },
    });
    const out = await engine.handle(msg({ callback: 'pay:cash' }));
    expect(appointmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
    expect(out[0].text).toContain('expiró');
  });

  it('"cancelar" en medio del flujo libera la reserva TENTATIVE', async () => {
    const { engine, client } = makeHarness({ conversation: paymentConvo });
    const out = await engine.handle(msg({ text: 'cancelar' }));
    expect(client.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'appt-1',
          status: { in: ['TENTATIVE', 'PENDING_PAYMENT'] },
        }),
      }),
    );
    expect(out[0].text).toContain('cancelé');
  });
});

describe('ConversationEngine — pago por QR y comprobante', () => {
  const paymentConvo = {
    step: 'CHOOSING_PAYMENT',
    tenantId: 't1',
    data: {
      name: 'Ana Fernández',
      doctorId: 'doc1',
      doctorName: 'Dr. Bryan',
      price: '150',
      appointmentId: 'appt-1',
    },
  };

  it('QR compartido: manda el QR del tenant y deja la cita PENDING_PAYMENT', async () => {
    const { engine, appointmentUpdate } = makeHarness({ conversation: paymentConvo });
    const out = await engine.handle(msg({ callback: 'pay:qr' }));
    expect(appointmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_PAYMENT', paymentMethod: 'STATIC_QR' }),
      }),
    );
    expect(out[0].imageUrl).toBe(TENANT.staticQrUrl);
    expect(out[0].text).toContain('Bs 150');
    expect(out[0].text).toContain('Banco Unión');
  });

  it('modo PER_DOCTOR: manda el QR propio del doctor', async () => {
    const { engine } = makeHarness({
      conversation: paymentConvo,
      tenant: { qrAssignmentMode: 'PER_DOCTOR' },
      doctorQr: { qrUrl: 'https://pub.r2.dev/regenera/doctors/doc1/qr.png', qrLabel: 'BNB' },
    });
    const out = await engine.handle(msg({ callback: 'pay:qr' }));
    expect(out[0].imageUrl).toBe('https://pub.r2.dev/regenera/doctors/doc1/qr.png');
    expect(out[0].text).toContain('BNB');
  });

  it('sin QR configurado: ofrece efectivo en vez de romperse', async () => {
    const { engine } = makeHarness({
      conversation: paymentConvo,
      tenant: { staticQrUrl: null, staticQrLabel: null },
    });
    const out = await engine.handle(msg({ callback: 'pay:qr' }));
    expect(out[0].text).toContain('no tiene QR');
    expect(out[0].buttons!.flat().some((b) => b.data === 'pay:cash')).toBe(true);
  });

  it('la foto del comprobante sube a R2, guarda receiptUrl y avisa la revisión', async () => {
    const { engine, uploadImage, appointmentUpdate } = makeHarness({
      conversation: { ...paymentConvo, step: 'AWAITING_RECEIPT' },
      appointment: {
        id: 'appt-1',
        status: 'PENDING_PAYMENT',
        expiresAt: null,
        startTime: new Date('2030-05-01T14:00:00Z'),
      },
    });
    const out = await engine.handle(
      msg({ photo: { buffer: Buffer.from('fake-jpg'), mimeType: 'image/jpeg' } }),
    );
    expect(uploadImage).toHaveBeenCalledWith('receipts/t1', expect.any(Buffer), 'image/jpeg');
    expect(appointmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { receiptUrl: 'https://pub.r2.dev/receipts/t1/rec.jpg' },
      }),
    );
    expect(out[0].text).toContain('Comprobante recibido');
  });

  it('foto sin reserva esperando comprobante: mensaje amable, sin subir nada', async () => {
    const { engine, uploadImage } = makeHarness({ conversation: { step: 'IDLE' } });
    const out = await engine.handle(
      msg({ photo: { buffer: Buffer.from('x'), mimeType: 'image/jpeg' } }),
    );
    expect(uploadImage).not.toHaveBeenCalled();
    expect(out[0].text).toContain('no tengo una reserva');
  });
});
