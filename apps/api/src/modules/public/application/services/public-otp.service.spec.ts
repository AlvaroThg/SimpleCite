import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PublicOtpService } from './public-otp.service';

/**
 * OTP de paciente: es el login del portal público. Si falla, un tercero entra
 * a la cuenta de un paciente y ve su agenda con esa clínica.
 *
 * Lo que se blinda acá:
 *   - El código NUNCA sale en la respuesta (solo metadata).
 *   - Se persiste hasheado, jamás en claro.
 *   - Rate limit por teléfono y por IP (backed por DB, no en memoria).
 *   - Lock a los 5 intentos + single-use.
 *   - Los mensajes de error no distinguen "no existe" de "expiró" de
 *     "bloqueado" (no se puede enumerar).
 */

const TENANT = 'clinica-1';
const PHONE_RAW = '70000000'; // local boliviano
const PHONE_E164 = '59170000000'; // como lo normaliza el service

function makeHarness(
  opts: {
    turnstileOk?: boolean;
    otpsFromPhone?: number;
    otpsFromIp?: number;
    activeOtp?: {
      id: string;
      codeHash: string;
      attempts: number;
    } | null;
  } = {},
) {
  const create = jest.fn().mockResolvedValue({ id: 'otp-1' });
  const update = jest.fn().mockResolvedValue({});
  const count = jest
    .fn()
    // Primer count = por teléfono, segundo = por IP (orden de enforceRateLimits).
    .mockResolvedValueOnce(opts.otpsFromPhone ?? 0)
    .mockResolvedValueOnce(opts.otpsFromIp ?? 0);
  const findFirst = jest.fn().mockResolvedValue(opts.activeOtp ?? null);

  const prisma = { client: { patientOtp: { create, update, count, findFirst } } };
  const config = {
    get: (k: string) =>
      ({
        OTP_TTL_MINUTES: 10,
        PATIENT_JWT_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres',
        PATIENT_SESSION_TTL: '30m',
      })[k],
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('jwt-de-sesion') };
  const turnstile = { verify: jest.fn().mockResolvedValue(opts.turnstileOk ?? true) };
  const whatsapp = { sendOtp: jest.fn().mockResolvedValue(undefined) };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const svc = new PublicOtpService(
    prisma as never,
    config as never,
    jwt as never,
    turnstile as never,
    whatsapp as never,
    logger as never,
  );
  return { svc, create, update, count, jwt, whatsapp, turnstile };
}

const req = { tenantId: TENANT, phone: PHONE_RAW, turnstileToken: 'tok', remoteIp: '1.2.3.4' };

describe('PublicOtpService.request', () => {
  it('no devuelve el código: solo cuánto dura', async () => {
    const { svc } = makeHarness();
    const res = await svc.request(req);
    expect(res).toEqual({ success: true, expiresInSeconds: 600 });
    expect(JSON.stringify(res)).not.toMatch(/\d{6}/);
  });

  it('persiste el código hasheado, nunca en claro', async () => {
    const { svc, create, whatsapp } = makeHarness();
    await svc.request(req);

    const saved = create.mock.calls[0][0].data as { codeHash: string; phone: string };
    const sent = whatsapp.sendOtp.mock.calls[0][0] as { code: string };

    expect(saved.codeHash).not.toBe(sent.code);
    expect(saved.codeHash).toMatch(/^\$2[aby]\$/); // prefijo bcrypt
    await expect(bcrypt.compare(sent.code, saved.codeHash)).resolves.toBe(true);
  });

  it('genera 6 dígitos', async () => {
    const { svc, whatsapp } = makeHarness();
    await svc.request(req);
    expect((whatsapp.sendOtp.mock.calls[0][0] as { code: string }).code).toMatch(/^\d{6}$/);
  });

  it('guarda el teléfono normalizado a E.164 (para que cuadre al verificar)', async () => {
    const { svc, create } = makeHarness();
    await svc.request(req);
    expect((create.mock.calls[0][0].data as { phone: string }).phone).toBe(PHONE_E164);
  });

  it('rechaza si el anti-bot (Turnstile) falla, sin emitir OTP', async () => {
    const { svc, create } = makeHarness({ turnstileOk: false });
    await expect(svc.request(req)).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('429 al 3er OTP de la misma hora para ese teléfono', async () => {
    const { svc, create } = makeHarness({ otpsFromPhone: 3 });
    await expect(svc.request(req)).rejects.toBeInstanceOf(HttpException);
    expect(create).not.toHaveBeenCalled();
  });

  it('429 al superar el tope por IP (flood rotando teléfonos)', async () => {
    const { svc, create } = makeHarness({ otpsFromPhone: 0, otpsFromIp: 30 });
    await expect(svc.request(req)).rejects.toBeInstanceOf(HttpException);
    expect(create).not.toHaveBeenCalled();
  });

  it('sin IP conocida el límite por teléfono igual aplica', async () => {
    const { svc, create } = makeHarness({ otpsFromPhone: 0 });
    await svc.request({ ...req, remoteIp: undefined });
    expect(create).toHaveBeenCalled();
  });
});

describe('PublicOtpService.verify', () => {
  const CODE = '123456';
  const hash = () => bcrypt.hashSync(CODE, 4); // coste bajo: es un test

  it('devuelve sessionToken con el código correcto y consume el OTP', async () => {
    const { svc, update, jwt } = makeHarness({
      activeOtp: { id: 'otp-1', codeHash: hash(), attempts: 0 },
    });
    const res = await svc.verify({ tenantId: TENANT, phone: PHONE_RAW, code: CODE });

    expect(res.sessionToken).toBe('jwt-de-sesion');
    // Single-use: queda marcado como consumido.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consumedAt: expect.any(Date) }) }),
    );
    // El token se emite para el phone NORMALIZADO y atado al tenant.
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: PHONE_E164, tenantId: TENANT, type: 'patient-session' },
      expect.anything(),
    );
  });

  it('código incorrecto: 401 y suma un intento', async () => {
    const { svc, update, jwt } = makeHarness({
      activeOtp: { id: 'otp-1', codeHash: hash(), attempts: 0 },
    });
    await expect(
      svc.verify({ tenantId: TENANT, phone: PHONE_RAW, code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('al 5º intento el OTP queda invalidado aunque después manden el correcto', async () => {
    const { svc, update, jwt } = makeHarness({
      activeOtp: { id: 'otp-1', codeHash: hash(), attempts: 5 },
    });
    await expect(
      svc.verify({ tenantId: TENANT, phone: PHONE_RAW, code: CODE }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consumedAt: expect.any(Date) }) }),
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('sin OTP activo: 401 (no dice si el teléfono existe)', async () => {
    const { svc } = makeHarness({ activeOtp: null });
    await expect(
      svc.verify({ tenantId: TENANT, phone: PHONE_RAW, code: CODE }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('el mensaje de error es idéntico en los tres fallos: no se puede enumerar', async () => {
    const messages: string[] = [];
    for (const activeOtp of [
      null,
      { id: 'o', codeHash: hash(), attempts: 5 },
      { id: 'o', codeHash: hash(), attempts: 0 },
    ]) {
      const { svc } = makeHarness({ activeOtp });
      await svc
        .verify({ tenantId: TENANT, phone: PHONE_RAW, code: '999999' })
        .catch((e: Error) => messages.push(e.message));
    }
    expect(messages).toHaveLength(3);
    expect(new Set(messages).size).toBe(1);
  });
});
