import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;

/** JWT mock: registra el expiresIn recibido para verificar la sesión extendida. */
function makeJwt() {
  return { sign: jest.fn().mockReturnValue('signed.jwt.token') };
}

function makePrisma(user: unknown, tenant: unknown = { extendedSession: false }) {
  return {
    client: {
      user: { findFirst: jest.fn().mockResolvedValue(user) },
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
    },
  } as never;
}

describe('AuthService.login', () => {
  const hash = bcrypt.hashSync('correcta123', 4);
  const user = {
    id: 'u1',
    email: 'a@x.com',
    name: 'Admin',
    role: 'ADMIN',
    tenantId: 't1',
    password: hash,
    isActive: true,
  };

  it('devuelve token y usuario SIN el hash de contraseña', async () => {
    const svc = new AuthService(makePrisma(user), makeJwt() as never, logger);
    const res = await svc.login('a@x.com', 'correcta123', 't1');
    expect(res.accessToken).toBe('signed.jwt.token');
    expect(res.user).toEqual({
      id: 'u1',
      email: 'a@x.com',
      name: 'Admin',
      role: 'ADMIN',
      tenantId: 't1',
    });
    expect(res.user).not.toHaveProperty('password');
  });

  it('sesión normal (12h) cuando la clínica no activó la extendida', async () => {
    const jwt = makeJwt();
    const svc = new AuthService(makePrisma(user, { extendedSession: false }), jwt as never, logger);
    const res = await svc.login('a@x.com', 'correcta123', 't1');
    // sin expiresIn override → usa el default del módulo (12h)
    expect(jwt.sign).toHaveBeenCalledWith(expect.any(Object));
    expect(res.cookieMaxAgeMs).toBe(12 * 60 * 60 * 1000);
  });

  it('sesión extendida (30 días) cuando la clínica la activó para todos', async () => {
    const jwt = makeJwt();
    const svc = new AuthService(
      makePrisma(user, { extendedSession: true, extendedSessionAdminOnly: false }),
      jwt as never,
      logger,
    );
    const res = await svc.login('a@x.com', 'correcta123', 't1');
    expect(jwt.sign).toHaveBeenCalledWith(expect.any(Object), { expiresIn: '30d' });
    expect(res.cookieMaxAgeMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('adminOnly: el ADMIN sí obtiene sesión extendida', async () => {
    const jwt = makeJwt();
    const svc = new AuthService(
      makePrisma(user, { extendedSession: true, extendedSessionAdminOnly: true }),
      jwt as never,
      logger,
    );
    const res = await svc.login('a@x.com', 'correcta123', 't1');
    expect(res.cookieMaxAgeMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('adminOnly: un DOCTOR mantiene la sesión normal (12h)', async () => {
    const jwt = makeJwt();
    const doctor = { ...user, role: 'DOCTOR' };
    const svc = new AuthService(
      makePrisma(doctor, { extendedSession: true, extendedSessionAdminOnly: true }),
      jwt as never,
      logger,
    );
    const res = await svc.login('a@x.com', 'correcta123', 't1');
    expect(jwt.sign).toHaveBeenCalledWith(expect.any(Object));
    expect(res.cookieMaxAgeMs).toBe(12 * 60 * 60 * 1000);
  });

  it('rechaza contraseña incorrecta con 401 (mensaje genérico)', async () => {
    const svc = new AuthService(makePrisma(user), makeJwt() as never, logger);
    await expect(svc.login('a@x.com', 'incorrecta', 't1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza usuario inexistente / inactivo / de otro tenant con el MISMO 401', async () => {
    // El where exige email+tenantId+isActive: cualquier miss cae aquí.
    const svc = new AuthService(makePrisma(null), makeJwt() as never, logger);
    await expect(svc.login('noexiste@x.com', 'loquesea1', 't1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
