import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;
const jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') } as never;

function makePrisma(user: unknown) {
  return { client: { user: { findFirst: jest.fn().mockResolvedValue(user) } } } as never;
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
    const svc = new AuthService(makePrisma(user), jwt, logger);
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

  it('rechaza contraseña incorrecta con 401 (mensaje genérico)', async () => {
    const svc = new AuthService(makePrisma(user), jwt, logger);
    await expect(svc.login('a@x.com', 'incorrecta', 't1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza usuario inexistente / inactivo / de otro tenant con el MISMO 401', async () => {
    // El where exige email+tenantId+isActive: cualquier miss cae aquí.
    const svc = new AuthService(makePrisma(null), jwt, logger);
    await expect(svc.login('noexiste@x.com', 'loquesea1', 't1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
