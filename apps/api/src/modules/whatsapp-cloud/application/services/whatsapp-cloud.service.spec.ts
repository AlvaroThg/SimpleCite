import { WhatsappCloudService } from './whatsapp-cloud.service';

/**
 * Specs del adaptador de WhatsApp Cloud: render de BotOutbound a los widgets
 * de Meta (reply buttons ≤3, listas 4-10, imagen con caption) y límites de
 * caracteres de los títulos.
 */

const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;
const config = {
  get: jest.fn((key: string) => {
    const env: Record<string, string> = {
      META_WA_PHONE_NUMBER_ID: '123',
      META_WA_ACCESS_TOKEN: 'tok',
      META_WA_BASE_URL: 'https://graph.test/v25.0',
    };
    return env[key];
  }),
} as never;

function makeService() {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ messages: [{ id: 'wamid.1' }] }),
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => new ArrayBuffer(4),
  });
  global.fetch = fetchMock as never;
  return { svc: new WhatsappCloudService(config, logger), fetchMock };
}

const sentBody = (fetchMock: jest.Mock, call = 0) =>
  JSON.parse(fetchMock.mock.calls[call][1].body as string);

describe('WhatsappCloudService.renderOutbound', () => {
  it('sin botones: texto plano', async () => {
    const { svc, fetchMock } = makeService();
    await svc.renderOutbound('591700', { text: 'Hola' });
    const body = sentBody(fetchMock);
    expect(body.type).toBe('text');
    expect(body.text.body).toBe('Hola');
  });

  it('hasta 3 botones: interactive reply buttons con título ≤20', async () => {
    const { svc, fetchMock } = makeService();
    await svc.renderOutbound('591700', {
      text: '¿Cómo pagas?',
      buttons: [
        [{ label: '💵 Efectivo', data: 'pay:cash' }],
        [{ label: '📱 QR bancario', data: 'pay:qr' }],
      ],
    });
    const body = sentBody(fetchMock);
    expect(body.type).toBe('interactive');
    expect(body.interactive.type).toBe('button');
    const [b1, b2] = body.interactive.action.buttons;
    expect(b1.reply.id).toBe('pay:cash');
    expect(b1.reply.title.length).toBeLessThanOrEqual(20);
    expect(b2.reply.title).toBe('📱 QR bancario');
  });

  it('más de 3 botones: lista interactiva con filas id/título ≤24', async () => {
    const { svc, fetchMock } = makeService();
    await svc.renderOutbound('591700', {
      text: '¿Qué día?',
      buttons: [
        [{ label: 'lun, 13 jul', data: 'day:2026-07-13' }],
        [{ label: 'mar, 14 jul', data: 'day:2026-07-14' }],
        [{ label: 'mié, 15 jul', data: 'day:2026-07-15' }],
        [{ label: 'jue, 16 jul — Dr. Bryan (Regenera Fisioterapia)', data: 'day:2026-07-16' }],
      ],
    });
    const body = sentBody(fetchMock);
    expect(body.interactive.type).toBe('list');
    const rows = body.interactive.action.sections[0].rows;
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ id: 'day:2026-07-13', title: 'lun, 13 jul' });
    expect(rows[3].title.length).toBeLessThanOrEqual(24);
    expect(rows[3].description).toBeDefined();
  });

  it('imagen: va con caption; los botones siguen en mensaje aparte', async () => {
    const { svc, fetchMock } = makeService();
    await svc.renderOutbound('591700', {
      text: '¡Hola! ¿Reservamos?',
      imageUrl: 'https://pub.r2.dev/regenera/fachada.jpg',
      buttons: [[{ label: 'Sí, reservar cita', data: 'book' }]],
    });
    const img = sentBody(fetchMock, 0);
    expect(img.type).toBe('image');
    expect(img.image.link).toBe('https://pub.r2.dev/regenera/fachada.jpg');
    // El texto viaja con los botones (no como caption): la entrega de la
    // imagen es más lenta y cruzaba el orden de lectura.
    const follow = sentBody(fetchMock, 1);
    expect(follow.type).toBe('interactive');
    expect(follow.interactive.body.text).toContain('Reservamos');
    expect(follow.interactive.action.buttons[0].reply.id).toBe('book');
  }, 10_000);

  it('las filas "Título — detalle" separan título y descripción', async () => {
    const { svc, fetchMock } = makeService();
    await svc.renderOutbound('591700', {
      text: '¿Qué servicio?',
      buttons: [
        [{ label: 'Tratamiento de Columna — Bs 150', data: 'sv:1' }],
        [{ label: 'Sesión Fisio — Bs 100', data: 'sv:2' }],
        [{ label: 'Consulta', data: 'sv:3' }],
        [{ label: 'Masaje descontracturante profundo premium', data: 'sv:4' }],
      ],
    });
    const rows = sentBody(fetchMock).interactive.action.sections[0].rows;
    expect(rows[0]).toMatchObject({ title: 'Tratamiento de Columna', description: 'Bs 150' });
    expect(rows[1]).toMatchObject({ title: 'Sesión Fisio', description: 'Bs 100' });
    expect(rows[2].description).toBeUndefined();
    // Sin separador y largo: título truncado + label completo de descripción.
    expect(rows[3].title.length).toBeLessThanOrEqual(24);
    expect(rows[3].description).toContain('premium');
  });
});
