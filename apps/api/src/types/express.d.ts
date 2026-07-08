/**
 * Augmentación del Request de Express con los campos que inyecta la app:
 *  - `tenantId`: lo resuelve TenantMiddleware (header/slug/subdominio).
 *  - `patient`: lo setean los guards de sesión de paciente (OTP / abierto).
 *
 * Con esto los middlewares/guards no necesitan `(req as any)`.
 */
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      patient?: { phone: string; tenantId: string };
    }
  }
}

export {};
