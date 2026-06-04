import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

function makePrisma(current: { id: string; status: string } | null) {
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
    const svc = new AppointmentsService(prisma);
    await svc.transitionStatus('t1', 'a1', 'CONFIRMED' as never);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CONFIRMED', isPaid: true }),
      }),
    );
  });

  it('permite TENTATIVE → PENDING_PAYMENT', async () => {
    const { prisma, update } = makePrisma({ id: 'a1', status: 'TENTATIVE' });
    const svc = new AppointmentsService(prisma);
    await svc.transitionStatus('t1', 'a1', 'PENDING_PAYMENT' as never);
    expect(update).toHaveBeenCalled();
  });

  it('rechaza transición inválida PENDING_PAYMENT → COMPLETED', async () => {
    const { prisma } = makePrisma({ id: 'a1', status: 'PENDING_PAYMENT' });
    const svc = new AppointmentsService(prisma);
    await expect(svc.transitionStatus('t1', 'a1', 'COMPLETED' as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza transición desde estado terminal (CANCELLED)', async () => {
    const { prisma } = makePrisma({ id: 'a1', status: 'CANCELLED' });
    const svc = new AppointmentsService(prisma);
    await expect(svc.transitionStatus('t1', 'a1', 'CONFIRMED' as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lanza NotFound si la cita no existe (aislamiento por tenant)', async () => {
    const { prisma } = makePrisma(null);
    const svc = new AppointmentsService(prisma);
    await expect(
      svc.transitionStatus('t1', 'missing', 'CONFIRMED' as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
