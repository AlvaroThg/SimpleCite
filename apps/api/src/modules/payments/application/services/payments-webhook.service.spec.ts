import { PaymentsWebhookService, type PaymentWebhookPayload } from './payments-webhook.service';

const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;
const waMessage = { send: jest.fn().mockResolvedValue({ sent: true }) } as never;

const basePayload: PaymentWebhookPayload = {
  eventId: 'evt_1',
  eventType: 'payment.succeeded',
  providerPaymentId: 'stub_abc',
  status: 'PAID',
  paidAt: new Date().toISOString(),
};

describe('PaymentsWebhookService.process (idempotencia)', () => {
  it('deduplica un evento repetido (eventId único → P2002)', async () => {
    const prisma = {
      paymentEvent: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }), // ya existe
        update: jest.fn(),
      },
      paymentIntent: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    } as never;

    const svc = new PaymentsWebhookService(prisma, waMessage, logger);
    const res = await svc.process(basePayload, basePayload);

    expect(res.deduplicated).toBe(true);
    // No debe intentar procesar el intent.
    expect((prisma as any).paymentIntent.findUnique).not.toHaveBeenCalled();
  });

  it('procesa PAID: marca intent pagado + confirma cita (transacción)', async () => {
    const tx = jest.fn().mockResolvedValue([]);
    const prisma = {
      paymentEvent: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentIntent: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'pi_1', appointmentId: 'a1', tenantId: 't1' }),
        // applyPaid construye el array del $transaction llamando estos métodos.
        update: jest.fn().mockReturnValue({}),
      },
      appointment: {
        update: jest.fn().mockReturnValue({}),
        findUnique: jest.fn().mockResolvedValue(null), // sendConfirmation corta
      },
      $transaction: tx,
    } as never;

    const svc = new PaymentsWebhookService(prisma, waMessage, logger);
    const res = await svc.process(basePayload, basePayload);

    expect(res.deduplicated).toBe(false);
    expect(tx).toHaveBeenCalledTimes(1); // applyPaid usa $transaction
    // Asocia el evento al intent + tenant.
    expect((prisma as any).paymentEvent.update).toHaveBeenCalled();
  });

  it('registra evento sin asociar cuando no hay intent para el providerPaymentId', async () => {
    const prisma = {
      paymentEvent: { create: jest.fn().mockResolvedValue({}), update: jest.fn() },
      paymentIntent: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    } as never;

    const svc = new PaymentsWebhookService(prisma, waMessage, logger);
    const res = await svc.process(basePayload, basePayload);

    expect(res.deduplicated).toBe(false);
    // Sin intent → no procesa transición.
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });
});
