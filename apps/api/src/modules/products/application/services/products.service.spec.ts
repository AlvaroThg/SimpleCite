import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';

function makePrisma(opts: {
  existing?: { id: string } | null;
  found?: { id: string; stock: number; tenantId: string } | null;
}) {
  const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data }));
  const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data }));
  const del = jest.fn().mockResolvedValue({ id: 'p1' });
  const client = {
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest
        .fn()
        // create() consulta por nombre; el resto (findById) por id+tenant.
        .mockResolvedValueOnce(opts.existing ?? opts.found ?? null)
        .mockResolvedValue(opts.found ?? null),
      create,
      update,
      delete: del,
    },
  };
  return { prisma: { client } as never, create, update, del };
}

describe('ProductsService', () => {
  it('create rechaza un nombre duplicado en el tenant', async () => {
    const { prisma } = makePrisma({ existing: { id: 'p0' } });
    const svc = new ProductsService(prisma);
    await expect(svc.create('t1', { name: 'Paracetamol' } as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('create persiste el producto con el tenantId', async () => {
    const { prisma, create } = makePrisma({ existing: null });
    const svc = new ProductsService(prisma);
    await svc.create('t1', { name: 'Gasa', stock: 10 } as never);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Gasa', tenantId: 't1' }) }),
    );
  });

  it('findById lanza NotFound si no existe en el tenant', async () => {
    const { prisma } = makePrisma({ found: null });
    const svc = new ProductsService(prisma);
    await expect(svc.findById('t1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adjustStock nunca deja el stock por debajo de 0', async () => {
    const { prisma, update } = makePrisma({ found: { id: 'p1', stock: 5, tenantId: 't1' } });
    const svc = new ProductsService(prisma);
    await svc.adjustStock('t1', 'p1', -10);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stock: 0 }) }),
    );
  });

  it('adjustStock suma correctamente', async () => {
    const { prisma, update } = makePrisma({ found: { id: 'p1', stock: 5, tenantId: 't1' } });
    const svc = new ProductsService(prisma);
    await svc.adjustStock('t1', 'p1', 3);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stock: 8 }) }),
    );
  });

  it('remove elimina el producto definitivamente', async () => {
    const { prisma, del } = makePrisma({ found: { id: 'p1', stock: 0, tenantId: 't1' } });
    const svc = new ProductsService(prisma);
    const res = await svc.remove('t1', 'p1');
    expect(res).toEqual({ success: true });
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' } }));
  });

  it('remove lanza NotFound si no existe en el tenant', async () => {
    const { prisma, del } = makePrisma({ found: null });
    const svc = new ProductsService(prisma);
    await expect(svc.remove('t1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(del).not.toHaveBeenCalled();
  });
});
