import { BadRequestException } from '@nestjs/common';
import { PatientsService } from './patients.service';

/**
 * Specs de la identidad del paciente: se exige teléfono O CI (al menos uno).
 * Los pacientes mayores llegan sin celular propio y la recepción los registra
 * por cédula; el bot en cambio siempre tiene el teléfono del chat.
 */

function makeService(found: { id: string; ci: string | null; phone: string | null } | null) {
  const create = jest.fn().mockResolvedValue({ id: 'p-new' });
  const update = jest.fn().mockResolvedValue({});
  const findFirst = jest.fn().mockResolvedValue(found);
  const prisma = { client: { patient: { findFirst, create, update } } } as never;
  return { svc: new PatientsService(prisma), create, update, findFirst };
}

describe('PatientsService.findOrCreate — identidad teléfono O CI', () => {
  it('rechaza el alta sin teléfono ni cédula (crearía duplicados sin identidad)', async () => {
    const { svc, create } = makeService(null);
    await expect(
      svc.findOrCreate({ tenantId: 't1', name: 'Ana Fernández' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('crea con solo cédula (paciente mayor sin celular)', async () => {
    const { svc, create } = makeService(null);
    await svc.findOrCreate({ tenantId: 't1', name: 'Ana Fernández', ci: '8123456' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: null, ci: '8123456' }),
      }),
    );
  });

  it('crea con solo teléfono (flujo del bot)', async () => {
    const { svc, create } = makeService(null);
    await svc.findOrCreate({ tenantId: 't1', name: 'Ana Fernández', phone: '59170000000' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: '59170000000', ci: null }),
      }),
    );
  });

  it('un string vacío no cuenta como teléfono', async () => {
    const { svc, create } = makeService(null);
    await expect(
      svc.findOrCreate({ tenantId: 't1', name: 'Ana Fernández', phone: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('completa el teléfono del paciente que estaba registrado solo por CI', async () => {
    // Registrado en recepción por cédula; luego reserva por el bot.
    const { svc, create, update } = makeService({ id: 'p1', ci: '8123456', phone: null });
    const out = await svc.findOrCreate({
      tenantId: 't1',
      name: 'Ana Fernández',
      phone: '59170000000',
      ci: '8123456',
    });
    expect(out.id).toBe('p1');
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { phone: '59170000000' } }),
    );
  });

  it('completa la cédula del paciente que solo tenía teléfono', async () => {
    const { svc, update } = makeService({ id: 'p1', ci: null, phone: '59170000000' });
    await svc.findOrCreate({
      tenantId: 't1',
      name: 'Ana Fernández',
      phone: '59170000000',
      ci: '8123456',
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { ci: '8123456' } }));
  });

  it('no toca al paciente que ya tiene ambos datos', async () => {
    const { svc, update } = makeService({ id: 'p1', ci: '8123456', phone: '59170000000' });
    await svc.findOrCreate({
      tenantId: 't1',
      name: 'Ana Fernández',
      phone: '59170000000',
      ci: '8123456',
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('PatientsService.list — búsqueda libre', () => {
  function makeListService() {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { client: { patient: { findMany } } } as never;
    return { svc: new PatientsService(prisma), findMany };
  }

  const orOf = (findMany: jest.Mock) =>
    (findMany.mock.calls[0][0].where as { OR?: object[] }).OR ?? [];

  it('buscar por nombre NO agrega un filtro de teléfono vacío', async () => {
    // normalizePhone('Braulio') → '' y `contains: ''` es LIKE '%%' en Postgres:
    // hacía match con todos los pacientes y el buscador no filtraba nada.
    const { svc, findMany } = makeListService();
    await svc.list('t1', { q: 'Braulio' } as never);

    const or = orOf(findMany);
    expect(JSON.stringify(or)).not.toContain('"contains":""');
    expect(or.some((c) => 'name' in c)).toBe(true);
    expect(or.some((c) => 'phone' in c)).toBe(false);
  });

  it('buscar por número sí filtra por teléfono', async () => {
    const { svc, findMany } = makeListService();
    await svc.list('t1', { q: '69303930' } as never);

    const or = orOf(findMany);
    expect(or.some((c) => 'phone' in c)).toBe(true);
  });

  it('sin término de búsqueda no arma ningún OR', async () => {
    const { svc, findMany } = makeListService();
    await svc.list('t1', {} as never);
    expect((findMany.mock.calls[0][0].where as { OR?: unknown }).OR).toBeUndefined();
  });
});
