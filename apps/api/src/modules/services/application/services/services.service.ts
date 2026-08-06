import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import type {
  CreateServiceDto,
  UpdateServiceDto,
  AssignServiceToDoctorDto,
  UpdateDoctorServiceDto,
} from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  // ───── Service (catálogo del tenant) ─────

  async create(tenantId: string, dto: CreateServiceDto) {
    const existing = await this.prisma.client.service.findFirst({
      where: { name: dto.name, tenantId },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`Ya existe un servicio "${dto.name}"`);

    return this.prisma.client.service.create({
      data: { ...dto, tenantId },
    });
  }

  async findAll(tenantId: string, opts: { includeInactive?: boolean } = {}) {
    return this.prisma.client.service.findMany({
      where: { tenantId, ...(opts.includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const service = await this.prisma.client.service.findFirst({
      where: { id, tenantId },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    return service;
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto) {
    await this.findById(tenantId, id); // valida existencia + scope
    return this.prisma.client.service.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Eliminación definitiva. Bloqueada si el servicio tiene citas: borrarlas en
   * cascada destruiría historial clínico y de ingresos. En ese caso el camino
   * es inactivarlo (isActive:false vía PATCH), que lo saca del booking.
   */
  async remove(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    const appointments = await this.prisma.client.appointment.count({
      where: { serviceId: id, tenantId },
    });
    if (appointments > 0) {
      throw new ConflictException(
        `Este servicio tiene ${appointments} cita(s) en el historial y no se puede eliminar. Inactívalo para que deje de ofrecerse.`,
      );
    }
    await this.prisma.client.service.delete({ where: { id } });
    return { success: true };
  }

  // ───── DoctorService (asignación catálogo ↔ doctor) ─────

  async assignToDoctor(tenantId: string, doctorId: string, dto: AssignServiceToDoctorDto) {
    // Validar que doctor y service pertenezcan al tenant
    const [doctor, service] = await Promise.all([
      this.prisma.client.user.findFirst({
        where: { id: doctorId, tenantId, role: 'DOCTOR' },
        select: { id: true },
      }),
      this.prisma.client.service.findFirst({
        where: { id: dto.serviceId, tenantId },
        select: { id: true },
      }),
    ]);
    if (!doctor) throw new NotFoundException('Doctor no encontrado');
    if (!service) throw new NotFoundException('Servicio no encontrado');

    const existing = await this.prisma.client.doctorService.findFirst({
      where: { doctorId, serviceId: dto.serviceId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Este doctor ya ofrece este servicio');
    }

    return this.prisma.client.doctorService.create({
      data: {
        doctorId,
        serviceId: dto.serviceId,
        tenantId,
        customDuration: dto.customDuration,
        customPrice: dto.customPrice,
      },
      include: { service: true },
    });
  }

  async listDoctorServices(tenantId: string, doctorId: string) {
    return this.prisma.client.doctorService.findMany({
      where: { doctorId, tenantId, isActive: true },
      include: { service: true },
      orderBy: { service: { name: 'asc' } },
    });
  }

  async updateDoctorService(
    tenantId: string,
    doctorServiceId: string,
    dto: UpdateDoctorServiceDto,
  ) {
    const link = await this.prisma.client.doctorService.findFirst({
      where: { id: doctorServiceId, tenantId },
    });
    if (!link) throw new NotFoundException('Asignación no encontrada');

    return this.prisma.client.doctorService.update({
      where: { id: doctorServiceId },
      data: dto,
      include: { service: true },
    });
  }

  async unassignFromDoctor(tenantId: string, doctorServiceId: string) {
    const link = await this.prisma.client.doctorService.findFirst({
      where: { id: doctorServiceId, tenantId },
    });
    if (!link) throw new NotFoundException('Asignación no encontrada');

    await this.prisma.client.doctorService.delete({ where: { id: doctorServiceId } });
    return { success: true };
  }

  /**
   * Color personal del doctor para su servicio (vista calendario del doctor).
   * `updateMany` + conteo: valida pertenencia (tenant + doctor) sin fuga.
   */
  async setDoctorServiceColor(
    tenantId: string,
    doctorId: string,
    serviceId: string,
    color: string | null,
  ) {
    const res = await this.prisma.client.doctorService.updateMany({
      where: { tenantId, doctorId, serviceId },
      data: { color },
    });
    if (res.count === 0) {
      throw new NotFoundException('No tienes asignado ese servicio');
    }
    return this.prisma.client.doctorService.findFirst({
      where: { tenantId, doctorId, serviceId },
      include: { service: true },
    });
  }
}
