import { of } from 'rxjs';
import { RollingSessionInterceptor } from './rolling-session.interceptor';
import { SESSION_COOKIE } from '../../modules/auth/infrastructure/adapters/session-cookie';

/**
 * Specs de la sesión deslizante: la cookie del panel se reemite cuando al JWT
 * le queda menos de la mitad de su vida, para que el usuario activo no se caiga
 * con un Unauthorized. Sin sesión (o con token fresco) no se toca nada.
 */

const USER = { sub: 'u1', email: 'a@b.com', role: 'ADMIN', tenantId: 't1' };
const TWELVE_H = 12 * 60 * 60;

function makeCtx(opts: { user?: object; cookie?: string }) {
  const res = { cookie: jest.fn() };
  const req = {
    user: opts.user,
    headers: opts.cookie ? { cookie: opts.cookie } : {},
  };
  const ctx = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as never;
  const next = { handle: () => of('ok') };
  return { ctx, next, res };
}

/** JWT con iat/exp controlados; el interceptor solo hace decode, no verify. */
function makeJwt(opts: { issuedAgo: number; lifetime: number }) {
  const now = Math.floor(Date.now() / 1000);
  return {
    decode: jest.fn().mockReturnValue({
      iat: now - opts.issuedAgo,
      exp: now - opts.issuedAgo + opts.lifetime,
    }),
    sign: jest.fn().mockReturnValue('token.reemitido'),
  };
}

describe('RollingSessionInterceptor', () => {
  it('refresca la cookie cuando queda menos de la mitad de la vida', async () => {
    // Emitido hace 7h de 12h → quedan 5h (< 6h) → refresca.
    const jwt = makeJwt({ issuedAgo: 7 * 3600, lifetime: TWELVE_H });
    const { ctx, next, res } = makeCtx({
      user: USER,
      cookie: `${SESSION_COOKIE}=token.viejo`,
    });

    await new RollingSessionInterceptor(jwt as never).intercept(ctx, next).toPromise();

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1', tenantId: 't1' }),
      // Conserva la duración original del token, no la del default del módulo.
      { expiresIn: TWELVE_H },
    );
    const [name, value, opts] = res.cookie.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(value).toBe('token.reemitido');
    expect(opts.maxAge).toBe(TWELVE_H * 1000);
    expect(opts.httpOnly).toBe(true);
  });

  it('token todavía fresco: no reemite nada', async () => {
    // Emitido hace 1h de 12h → quedan 11h → no toca la cookie.
    const jwt = makeJwt({ issuedAgo: 3600, lifetime: TWELVE_H });
    const { ctx, next, res } = makeCtx({
      user: USER,
      cookie: `${SESSION_COOKIE}=token.viejo`,
    });

    await new RollingSessionInterceptor(jwt as never).intercept(ctx, next).toPromise();

    expect(jwt.sign).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('conserva la vida larga de la sesión extendida (30d)', async () => {
    const THIRTY_D = 30 * 24 * 3600;
    const jwt = makeJwt({ issuedAgo: 20 * 24 * 3600, lifetime: THIRTY_D });
    const { ctx, next, res } = makeCtx({
      user: USER,
      cookie: `${SESSION_COOKIE}=token.viejo`,
    });

    await new RollingSessionInterceptor(jwt as never).intercept(ctx, next).toPromise();

    expect(jwt.sign).toHaveBeenCalledWith(expect.any(Object), { expiresIn: THIRTY_D });
    expect(res.cookie.mock.calls[0][2].maxAge).toBe(THIRTY_D * 1000);
  });

  it('ruta pública (sin request.user): no toca la cookie', async () => {
    const jwt = makeJwt({ issuedAgo: 7 * 3600, lifetime: TWELVE_H });
    const { ctx, next, res } = makeCtx({ cookie: `${SESSION_COOKIE}=token.viejo` });

    await new RollingSessionInterceptor(jwt as never).intercept(ctx, next).toPromise();

    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('sesión por Bearer (sin cookie): no reemite', async () => {
    const jwt = makeJwt({ issuedAgo: 7 * 3600, lifetime: TWELVE_H });
    const { ctx, next, res } = makeCtx({ user: USER });

    await new RollingSessionInterceptor(jwt as never).intercept(ctx, next).toPromise();

    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('si el refresh falla, la request sigue viva', async () => {
    const jwt = {
      decode: jest.fn(() => {
        throw new Error('token corrupto');
      }),
      sign: jest.fn(),
    };
    const { ctx, next, res } = makeCtx({
      user: USER,
      cookie: `${SESSION_COOKIE}=basura`,
    });

    const out = await new RollingSessionInterceptor(jwt as never).intercept(ctx, next).toPromise();

    expect(out).toBe('ok');
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
