import { ReportsService } from './reports.service';

/**
 * Specs del libro de ingresos: replica la libreta que la clínica lleva a mano,
 * así que el criterio de qué entra en el total es lo crítico — un descuadre
 * contra la caja del día destruye la confianza en el sistema entero.
 */

function makeService(rows: unknown[] = []) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = {
    client: {
      appointment: { findMany },
      tenant: { findUnique: jest.fn().mockResolvedValue({ timezone: 'America/La_Paz' }) },
    },
  } as never;
  return { svc: new ReportsService(prisma), findMany };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  startTime: new Date('2026-08-03T13:00:00Z'),
  status: 'COMPLETED',
  paymentMethod: 'CASH',
  price: '150',
  insuranceNameSnapshot: null,
  refundResolution: null,
  patient: { id: 'p1', name: 'Flor Medina' },
  doctor: { id: 'd1', name: 'Dr. Bryan' },
  service: { id: 's1', name: 'Fisio' },
  ...over,
});

describe('ReportsService.income — libro de ingresos', () => {
  it('solo trae citas con el pago registrado (plata que entró, no lo agendado)', async () => {
    const { svc, findMany } = makeService();
    await svc.income('t1', {});
    expect(findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', isPaid: true });
  });

  it('incluye una cita pagada que luego se canceló, y la marca', async () => {
    // El dinero entró: excluirla descuadraría el total contra la caja. Se
    // muestra marcada para que la recepción sepa que hay que resolverla.
    const { svc } = makeService([row({ status: 'CANCELLED', refundResolution: 'PENDING' })]);
    const res = await svc.income('t1', {});
    expect(res.items[0].cancelled).toBe(true);
    expect(res.items[0].refundResolution).toBe('PENDING');
    expect(res.items[0].amount).toBe(150);
  });

  it('aplica los filtros de doctor, servicio y paciente', async () => {
    const { svc, findMany } = makeService();
    await svc.income('t1', { doctorId: 'd1', serviceId: 's1', patientId: 'p1' });
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      doctorId: 'd1',
      serviceId: 's1',
      patientId: 'p1',
    });
  });

  it('acota por rango de fechas', async () => {
    const { svc, findMany } = makeService();
    await svc.income('t1', { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T23:59:59.000Z' });
    const { startTime } = findMany.mock.calls[0][0].where as {
      startTime: { gte: Date; lte: Date };
    };
    expect(startTime.gte).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(startTime.lte).toEqual(new Date('2026-08-31T23:59:59.000Z'));
  });

  it('sin filtros no acota por fecha (el rango lo decide quien consulta)', async () => {
    const { svc, findMany } = makeService();
    await svc.income('t1', {});
    expect((findMany.mock.calls[0][0].where as { startTime?: unknown }).startTime).toBeUndefined();
  });

  it('el monto sale del precio congelado de la cita, como número', async () => {
    const { svc } = makeService([row({ price: '110' })]);
    const res = await svc.income('t1', {});
    expect(res.items[0].amount).toBe(110);
  });

  it('una cita sin precio no rompe el total: cuenta 0', async () => {
    const { svc } = makeService([row({ price: null })]);
    const res = await svc.income('t1', {});
    expect(res.items[0].amount).toBe(0);
  });

  it('devuelve la timezone del tenant para agrupar por día correctamente', async () => {
    const { svc } = makeService([row()]);
    const res = await svc.income('t1', {});
    expect(res.timezone).toBe('America/La_Paz');
  });

  it('ordena por fecha ascendente (la libreta va en orden cronológico)', async () => {
    const { svc, findMany } = makeService();
    await svc.income('t1', {});
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ startTime: 'asc' });
  });
});
