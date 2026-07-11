import { TelegramService } from './telegram.service';

const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() } as never;
const config = { get: jest.fn().mockReturnValue('https://app.simplecite.com.bo') } as never;
const engine = { handle: jest.fn().mockResolvedValue([]) } as never;

describe('TelegramService (adaptador IMessagingService)', () => {
  it('sendMessage no lanza si el bot no está inicializado (sin token)', async () => {
    const svc = new TelegramService(undefined, config, engine, logger);
    await expect(svc.sendMessage('123', 'hola')).resolves.toBeUndefined();
  });

  it('sendMessage delega en bot.telegram.sendMessage(chatId, texto)', async () => {
    const sendMessage = jest.fn().mockResolvedValue({});
    const bot = { telegram: { sendMessage } } as never;
    const svc = new TelegramService(bot, config, engine, logger);
    await svc.sendMessage('999', 'hola');
    expect(sendMessage).toHaveBeenCalledWith('999', 'hola');
  });

  it('sendAppointmentConfirmation arma el magic link con el token', async () => {
    const sendMessage = jest.fn().mockResolvedValue({});
    const bot = { telegram: { sendMessage } } as never;
    const svc = new TelegramService(bot, config, engine, logger);
    await svc.sendAppointmentConfirmation(
      '999',
      'Ana',
      'Dr. Pérez',
      new Date('2030-05-01T15:00:00Z'),
      'tok123',
    );
    const [, text] = sendMessage.mock.calls[0];
    expect(text).toContain('Ana');
    expect(text).toContain('Dr. Pérez');
    expect(text).toContain('https://app.simplecite.com.bo/citas/cancelar?token=tok123');
  });
});
