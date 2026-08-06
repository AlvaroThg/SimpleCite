import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import type { RequesterContext } from './medical-records.service';

/**
 * Recetas: el dato más sensible del producto junto con la historia clínica.
 * Dos garantías que no pueden romperse en silencio:
 *   1. STAFF (recepción) no lee ni emite contenido clínico.
 *   2. Un DOCTOR solo opera sobre historias/recetas de SUS citas — el aislamiento
 *      entre especialistas de la misma clínica, no solo entre clínicas.
 */

const TENANT = 'clinica-1';
const DR_A = 'doctor-a';
const DR_B = 'doctor-b';

const asDoctorA: RequesterContext = { tenantId: TENANT, userId: DR_A, role: 'DOCTOR' };
const asAdmin: RequesterContext = { tenantId: TENANT, userId: 'admin-1', role: 'ADMIN' };
const asStaff: RequesterContext = { tenantId: TENANT, userId: 'staff-1', role: 'STAFF' };

function makeHarness(
  opts: {
    record?: { id: string; patientId: string; doctorId: string } | null;
    prescription?: { id: string; doctorId: string } | null;
  } = {},
) {
  const create = jest.fn().mockResolvedValue({ id: 'presc-1' });
  const findMany = jest.fn().mockResolvedValue([]);
  const del = jest.fn().mockResolvedValue({});
  const queryRaw = jest.fn().mockResolvedValue([]);

  const prisma = {
    client: {
      medicalRecord: { findFirst: jest.fn().mockResolvedValue(opts.record ?? null) },
      prescription: {
        create,
        findMany,
        delete: del,
        findFirst: jest.fn().mockResolvedValue(opts.prescription ?? null),
      },
      $queryRaw: queryRaw,
    },
  };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return {
    svc: new PrescriptionsService(prisma as never, logger as never),
    create,
    findMany,
    del,
    recordFindFirst: prisma.client.medicalRecord.findFirst,
  };
}

const dto = { medications: [{ name: 'Ibuprofeno', dose: '400mg' }] } as never;
const ownRecord = { id: 'rec-1', patientId: 'pat-1', doctorId: DR_A };
const foreignRecord = { id: 'rec-9', patientId: 'pat-9', doctorId: DR_B };

describe('PrescriptionsService — STAFF no toca contenido clínico', () => {
  it('create: recepción no puede emitir recetas', async () => {
    const { svc, create } = makeHarness({ record: ownRecord });
    await expect(svc.create(asStaff, 'rec-1', dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('listByRecord: recepción no puede leerlas', async () => {
    const { svc, findMany } = makeHarness({ record: ownRecord });
    await expect(svc.listByRecord(asStaff, 'rec-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('findById: recepción no puede abrir una receta suelta', async () => {
    const { svc } = makeHarness({ prescription: { id: 'p1', doctorId: DR_A } });
    await expect(svc.findById(asStaff, 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('remove: recepción no puede borrarlas', async () => {
    const { svc, del } = makeHarness({ prescription: { id: 'p1', doctorId: DR_A } });
    await expect(svc.remove(asStaff, 'p1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(del).not.toHaveBeenCalled();
  });
});

describe('PrescriptionsService — un DOCTOR no entra a historias de un colega', () => {
  it('create: no puede recetar sobre la historia de otro especialista', async () => {
    const { svc, create } = makeHarness({ record: foreignRecord });
    await expect(svc.create(asDoctorA, 'rec-9', dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('create: sí puede sobre la suya, y firma la receta con SU id', async () => {
    const { svc, create } = makeHarness({ record: ownRecord });
    await svc.create(asDoctorA, 'rec-1', dto);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ doctorId: DR_A, tenantId: TENANT, patientId: 'pat-1' }),
      }),
    );
  });

  it('listByRecord: no puede listar las recetas de una historia ajena', async () => {
    const { svc, findMany } = makeHarness({ record: foreignRecord });
    await expect(svc.listByRecord(asDoctorA, 'rec-9')).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('findById: no puede abrir la receta emitida por otro', async () => {
    const { svc } = makeHarness({ prescription: { id: 'p9', doctorId: DR_B } });
    await expect(svc.findById(asDoctorA, 'p9')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('remove: no puede borrar la receta de otro', async () => {
    const { svc, del } = makeHarness({ prescription: { id: 'p9', doctorId: DR_B } });
    await expect(svc.remove(asDoctorA, 'p9')).rejects.toBeInstanceOf(ForbiddenException);
    expect(del).not.toHaveBeenCalled();
  });

  it('el ADMIN sí ve todo el historial clínico de su clínica', async () => {
    const { svc, findMany } = makeHarness({ record: foreignRecord });
    await svc.listByRecord(asAdmin, 'rec-9');
    expect(findMany).toHaveBeenCalled();
  });
});

describe('PrescriptionsService — aislamiento por tenant', () => {
  it('una historia de otra clínica es 404, no 403 (no revela que existe)', async () => {
    const { svc } = makeHarness({ record: null });
    await expect(svc.create(asAdmin, 'rec-de-otra-clinica', dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('la búsqueda de la historia siempre filtra por tenantId', async () => {
    const { svc, recordFindFirst } = makeHarness({ record: ownRecord });
    await svc.listByRecord(asDoctorA, 'rec-1');
    expect(recordFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
    );
  });

  it('el listado de recetas también filtra por tenantId', async () => {
    const { svc, findMany } = makeHarness({ record: ownRecord });
    await svc.listByRecord(asDoctorA, 'rec-1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
    );
  });
});

describe('PrescriptionsService — el descuento de stock nunca rompe la receta', () => {
  it('un fallo de inventario no impide emitirla (best-effort)', async () => {
    const { svc, create } = makeHarness({ record: ownRecord });
    const prisma = (svc as unknown as { prisma: { client: { $queryRaw: jest.Mock } } }).prisma;
    prisma.client.$queryRaw.mockRejectedValue(new Error('deadlock'));

    const res = await svc.create(asDoctorA, 'rec-1', {
      medications: [{ name: 'Ibuprofeno', productId: 'prod-1' }],
    } as never);

    expect(create).toHaveBeenCalled();
    expect(res.lowStock).toEqual([]);
  });

  it('avisa el stock bajo sin bloquear la emisión', async () => {
    const { svc } = makeHarness({ record: ownRecord });
    const prisma = (svc as unknown as { prisma: { client: { $queryRaw: jest.Mock } } }).prisma;
    prisma.client.$queryRaw.mockResolvedValue([
      { id: 'prod-1', name: 'Ibuprofeno', stock: 2, lowStockThreshold: 5 },
    ]);

    const res = await svc.create(asDoctorA, 'rec-1', {
      medications: [{ name: 'Ibuprofeno', productId: 'prod-1' }],
    } as never);

    expect(res.lowStock).toEqual([{ id: 'prod-1', name: 'Ibuprofeno', stock: 2 }]);
  });
});
