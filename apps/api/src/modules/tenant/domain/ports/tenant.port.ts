/**
 * Puerto de entrada del servicio de Tenant (Inbound Port).
 * Define las operaciones de dominio disponibles para el módulo Tenant.
 */
export interface TenantServicePort {
  findBySlug(slug: string): Promise<TenantEntity | null>;
  findById(id: string): Promise<TenantEntity | null>;
}

/**
 * Entidad de dominio del Tenant.
 * Representación pura sin dependencias de infraestructura.
 */
export interface TenantEntity {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  plan: string;
  status: string;
  timezone: string;
  whatsappEnabled: boolean;
  whatsappNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
}
