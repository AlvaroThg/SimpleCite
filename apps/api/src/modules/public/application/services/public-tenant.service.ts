import { Injectable, NotFoundException } from '@nestjs/common';
import type { PublicTenantInfo, SlotsQueryDto } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';
import { SlotsService } from '../../../slots/application/services/slots.service';

/**
 * Información pública del tenant: lo que un visitante anónimo puede ver
 * antes de identificarse. Datos sensibles (emails de staff, configuración
 * interna, etc.) NO se exponen acá.
 */
@Injectable()
export class PublicTenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotsService,
  ) {}

  async getInfo(tenantId: string): Promise<PublicTenantInfo> {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        slug: true,
        name: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        heroImageUrl: true,
        heroTitle: true,
        heroSubtitle: true,
        servicesTitle: true,
        specialistsTitle: true,
        ctaTitle: true,
        ctaSubtitle: true,
        address: true,
        facebookUrl: true,
        instagramUrl: true,
        whatsappContact: true,
        locationPhotoUrl: true,
        mapsUrl: true,
        staticQrUrl: true,
        staticQrLabel: true,
        staticQrUrl2: true,
        staticQrLabel2: true,
        qrAssignmentMode: true,
        timezone: true,
        whatsappEnabled: true,
        status: true,
      },
    });
    if (!tenant || tenant.status === 'SUSPENDED') {
      throw new NotFoundException('Tenant no disponible');
    }
    return {
      slug: tenant.slug,
      name: tenant.name,
      logoUrl: tenant.logoUrl,
      primaryColor: tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
      heroImageUrl: tenant.heroImageUrl,
      heroTitle: tenant.heroTitle,
      heroSubtitle: tenant.heroSubtitle,
      servicesTitle: tenant.servicesTitle,
      specialistsTitle: tenant.specialistsTitle,
      ctaTitle: tenant.ctaTitle,
      ctaSubtitle: tenant.ctaSubtitle,
      address: tenant.address,
      facebookUrl: tenant.facebookUrl,
      instagramUrl: tenant.instagramUrl,
      whatsappContact: tenant.whatsappContact,
      locationPhotoUrl: tenant.locationPhotoUrl,
      mapsUrl: tenant.mapsUrl,
      staticQrUrl: tenant.staticQrUrl,
      staticQrLabel: tenant.staticQrLabel,
      staticQrUrl2: tenant.staticQrUrl2,
      staticQrLabel2: tenant.staticQrLabel2,
      qrAssignmentMode: tenant.qrAssignmentMode,
      timezone: tenant.timezone,
      whatsappEnabled: tenant.whatsappEnabled,
    };
  }

  /**
   * Doctores activos con su especialidad/bio + servicios que ofrecen.
   * Forma el "catálogo" que muestra la landing/wizard. Incluye el modo seguro
   * y los seguros activos del doctor (Addendum G) para que el booking arme el
   * paso "select-insurance" sin fetch adicional.
   */
  async listDoctorsWithServices(tenantId: string) {
    const doctors = await this.prisma.client.user.findMany({
      where: { tenantId, role: 'DOCTOR', isActive: true },
      select: {
        id: true,
        name: true,
        doctorProfile: {
          select: {
            specialty: true,
            bio: true,
            qrUrl: true,
            qrLabel: true,
            insuranceMode: true,
            photoUrl: true,
          },
        },
        insuranceAssignments: {
          where: { isActive: true, tenantInsurance: { isActive: true } },
          select: {
            tenantInsurance: { select: { id: true, name: true } },
          },
        },
        doctorServices: {
          where: { isActive: true },
          select: {
            id: true,
            customDuration: true,
            customPrice: true,
            service: {
              select: {
                id: true,
                name: true,
                description: true,
                duration: true,
                price: true,
                icon: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Aplanar la asignación M:N a una lista simple { id, name } para el wizard.
    return doctors.map(({ insuranceAssignments, ...d }) => ({
      ...d,
      insurances: insuranceAssignments.map((a) => a.tenantInsurance),
    }));
  }

  /**
   * Lookup de paciente regresante por CI (flujo "¿Ya visitaste antes?").
   *
   * Mínima exposición: solo devuelve el id y el PRIMER nombre — nunca apellido,
   * teléfono ni historial. La respuesta es idéntica exista o no el CI en otro
   * tenant, y el tiempo de respuesta se normaliza (piso fijo) para no permitir
   * enumerar CIs por timing.
   */
  async lookupPatientByCi(
    tenantId: string,
    ci: string,
  ): Promise<{ found: boolean; patientId?: string; firstName?: string }> {
    const MIN_RESPONSE_MS = 150;
    const started = Date.now();

    const patient = await this.prisma.client.patient.findFirst({
      where: { ci: ci.trim(), tenantId },
      select: { id: true, name: true },
    });

    // Piso de tiempo constante: mitiga timing attacks de enumeración.
    const elapsed = Date.now() - started;
    if (elapsed < MIN_RESPONSE_MS) {
      await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
    }

    if (!patient) return { found: false };
    const firstName = patient.name.trim().split(/\s+/)[0] ?? '';
    return { found: true, patientId: patient.id, firstName };
  }

  /**
   * Disponibilidad de slots — delega al motor de slots existente.
   * La validación de tenantId+doctor+service la hace SlotsService internamente.
   */
  async getAvailability(tenantId: string, query: SlotsQueryDto) {
    return this.slots.generate(tenantId, query);
  }
}
