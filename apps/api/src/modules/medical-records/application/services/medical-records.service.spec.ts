import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MedicalRecordsService, type RequesterContext } from './medical-records.service';

const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() } as never;

function makePrisma(opts: { appt?: { id: string; patientId: string; doctorId: string } | null }) {
  const upsert = jest
    .fn()
    .mockImplementation(({ create }) => Promise.resolve({ id: 'r1', ...create }));
  const client = {
    appointment: {
      findFirst: jest.fn().mockResolvedValue(opts.appt ?? null),
    },
    medicalRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert,
    },
  };
  return { prisma: { client } as never, upsert };
}

const admin: RequesterContext = { tenantId: 't1', userId: 'admin1', role: 'ADMIN' as never };
const doctor = (id: string): RequesterContext =>
  ({ tenantId: 't1', userId: id, role: 'DOCTOR' }) as never;
const staff: RequesterContext = { tenantId: 't1', userId: 's1', role: 'STAFF' as never };

const appt = { id: 'a1', patientId: 'pac1', doctorId: 'd1' };

describe('MedicalRecordsService (control de acceso EHR)', () => {
  it('STAFF no puede leer el historial clínico', async () => {
    const { prisma } = makePrisma({ appt });
    const svc = new MedicalRecordsService(prisma, logger);
    await expect(svc.getByAppointment(staff, 'a1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lanza NotFound si la cita no es del tenant', async () => {
    const { prisma } = makePrisma({ appt: null });
    const svc = new MedicalRecordsService(prisma, logger);
    await expect(svc.getByAppointment(admin, 'a1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un DOCTOR no accede a la cita de otro doctor', async () => {
    const { prisma } = makePrisma({ appt });
    const svc = new MedicalRecordsService(prisma, logger);
    await expect(svc.getByAppointment(doctor('otro'), 'a1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('upsert escribe la historia con el doctor autenticado como autor', async () => {
    const { prisma, upsert } = makePrisma({ appt });
    const svc = new MedicalRecordsService(prisma, logger);
    await svc.upsert(doctor('d1'), 'a1', { diagnosis: 'Gripe' } as never);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ doctorId: 'd1', tenantId: 't1', patientId: 'pac1' }),
      }),
    );
  });
});
