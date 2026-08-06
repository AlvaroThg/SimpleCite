import { ForbiddenException } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';

/**
 * El TenantGuard es la frontera entre clínicas. Su entrada, `request.tenantId`,
 * la deja el TenantMiddleware — que corre ANTES del JwtAuthGuard, así que su
 * "estrategia 3: claim del JWT" nunca llega a ejecutarse y el valor termina
 * saliendo de los headers `x-tenant-id` / `x-tenant-slug`, que los elige el
 * cliente.
 *
 * Consecuencia si el guard confía en ese valor: el usuario de una clínica
 * SUSPENDIDA manda el id de una clínica activa y sigue trabajando (sus queries
 * igual se filtran por el tenantId del JWT, pero el control de suspensión se
 * evalúa contra la clínica equivocada). Estos tests fijan que el JWT gana.
 */

function makeCtx(request: Record<string, unknown>) {
  return {
    getType: () => 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

function makeGuard(tenant: { id: string; status: string; slug: string } | null, isPublic = false) {
  const findUnique = jest.fn().mockResolvedValue(tenant);
  const prisma = { tenant: { findUnique } };
  const reflector = { getAllAndOverride: () => isPublic };
  return { guard: new TenantGuard(prisma as never, reflector as never), findUnique };
}

const ACTIVA = { id: 'tenant-activa', status: 'ACTIVE', slug: 'activa' };
const SUSPENDIDA = { id: 'tenant-suspendida', status: 'SUSPENDED', slug: 'suspendida' };

describe('TenantGuard — el JWT manda sobre el header', () => {
  it('valida contra el tenant del JWT, ignorando el x-tenant-id del cliente', async () => {
    const { guard, findUnique } = makeGuard(SUSPENDIDA);
    const request = {
      tenantId: 'tenant-activa', // ← lo que puso el atacante por header
      user: { sub: 'u1', role: 'ADMIN', tenantId: 'tenant-suspendida' }, // ← su JWT real
    };

    await expect(guard.canActivate(makeCtx(request))).rejects.toBeInstanceOf(ForbiddenException);
    // Consultó SU clínica, no la que mandó por header.
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tenant-suspendida' } }),
    );
  });

  it('reancla request.tenantId al JWT (el interceptor RLS lee de ahí)', async () => {
    const { guard } = makeGuard(ACTIVA);
    const request: Record<string, unknown> = {
      tenantId: 'tenant-de-otra-clinica',
      user: { sub: 'u1', role: 'ADMIN', tenantId: 'tenant-activa' },
    };

    await expect(guard.canActivate(makeCtx(request))).resolves.toBe(true);
    expect(request.tenantId).toBe('tenant-activa');
  });

  it('una clínica suspendida no pasa', async () => {
    const { guard } = makeGuard(SUSPENDIDA);
    const request = { user: { sub: 'u1', tenantId: 'tenant-suspendida' } };
    await expect(guard.canActivate(makeCtx(request))).rejects.toThrow(/suspendida/i);
  });

  it('un tenantId que no existe no pasa', async () => {
    const { guard } = makeGuard(null);
    const request = { user: { sub: 'u1', tenantId: 'fantasma' } };
    await expect(guard.canActivate(makeCtx(request))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sin tenant identificado no pasa', async () => {
    const { guard } = makeGuard(ACTIVA);
    await expect(guard.canActivate(makeCtx({}))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('TenantGuard — rutas públicas', () => {
  it('sin auth, el tenantId del path público (booking) sigue mandando', async () => {
    // En /api/public/tenants/:slug/... no hay JWT de staff: el middleware
    // resuelve el tenant por slug y esa es la autoridad correcta.
    const { guard, findUnique } = makeGuard(ACTIVA, true);
    const request = { tenantId: 'tenant-activa' };
    await expect(guard.canActivate(makeCtx(request))).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tenant-activa' } }),
    );
  });

  it('una ruta pública sin tenant (health) pasa sin validar nada', async () => {
    const { guard, findUnique } = makeGuard(ACTIVA, true);
    await expect(guard.canActivate(makeCtx({}))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('el booking público de una clínica suspendida queda cerrado', async () => {
    const { guard } = makeGuard(SUSPENDIDA, true);
    await expect(
      guard.canActivate(makeCtx({ tenantId: 'tenant-suspendida' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('TenantGuard — contextos no HTTP', () => {
  it('los updates del bot (telegraf) no pasan por el guard', async () => {
    const { guard, findUnique } = makeGuard(ACTIVA);
    const ctx = { getType: () => 'telegraf' } as never;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
