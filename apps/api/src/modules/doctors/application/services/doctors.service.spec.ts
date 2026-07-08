import { ConflictException } from '@nestjs/common';
import { DoctorsService } from './doctors.service';

const storage = { uploadImageFromBase64: jest.fn() } as never;

function makePrisma(opts: {
  emailTaken?: boolean;
  plan?: 'PRO' | 'ELITE';
  activeDoctors?: number;
  existingNames?: { name: string; isActive: boolean }[];
}) {
  const create = jest.fn().mockResolvedValue({
    id: 'd1',
    email: 'nuevo@x.com',
    name: 'Dra. Nueva',
    role: 'DOCTOR',
    isActive: true,
    doctorProfile: { specialty: 'Fisio' },
  });
  const client = {
    user: {
      findFirst: jest.fn().mockResolvedValue(opts.emailTaken ? { id: 'other' } : null),
      findMany: jest.fn().mockResolvedValue(opts.existingNames ?? []),
      count: jest.fn().mockResolvedValue(opts.activeDoctors ?? 0),
      create,
    },
    tenant: { findUnique: jest.fn().mockResolvedValue({ plan: opts.plan ?? 'PRO' }) },
  };
  return { prisma: { client } as never, create };
}

const dto = {
  email: 'nuevo@x.com',
  password: 'clave12345',
  name: 'Dra. Nueva',
  specialty: 'Fisio',
} as never;

describe('DoctorsService.create', () => {
  it('rechaza el especialista 11 en plan Profesional (límite 10 activos)', async () => {
    const { prisma } = makePrisma({ plan: 'PRO', activeDoctors: 10 });
    const svc = new DoctorsService(prisma, storage);
    await expect(svc.create('t1', dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('plan Clínica no tiene límite de especialistas', async () => {
    const { prisma, create } = makePrisma({ plan: 'ELITE', activeDoctors: 50 });
    const svc = new DoctorsService(prisma, storage);
    await svc.create('t1', dto);
    expect(create).toHaveBeenCalled();
  });

  it('rechaza nombres duplicados ignorando puntos, tildes y mayúsculas', async () => {
    const { prisma } = makePrisma({
      existingNames: [{ name: 'Dr. Bryan', isActive: true }],
    });
    const svc = new DoctorsService(prisma, storage);
    await expect(svc.create('t1', { ...dto, name: 'dr bryan' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
