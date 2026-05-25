import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { CreateDoctorDto, UpdateDoctorDto } from '@simplecite/shared';
import type { PrismaService } from '../../../../common/database/prisma.service';

const SALT_ROUNDS = 10;

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateDoctorDto) {
    // Email único dentro del tenant
    const existing = await this.prisma.client.user.findFirst({
      where: { email: dto.email, tenantId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Ya existe un usuario con email ${dto.email}`);
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const doctor = await this.prisma.client.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        role: 'DOCTOR',
        tenantId,
        doctorProfile: {
          create: {
            specialty: dto.specialty,
            licenseNumber: dto.licenseNumber,
            bio: dto.bio,
            tenantId,
          },
        },
      },
      include: { doctorProfile: true },
    });

    return this.toPublic(doctor);
  }

  async findAll(tenantId: string, opts: { includeArchived?: boolean } = {}) {
    const doctors = await this.prisma.client.user.findMany({
      where: {
        tenantId,
        role: 'DOCTOR',
        ...(opts.includeArchived ? {} : { isActive: true }),
      },
      include: { doctorProfile: true },
      orderBy: { name: 'asc' },
    });
    return doctors.map((d) => this.toPublic(d));
  }

  async findById(tenantId: string, doctorId: string) {
    const doctor = await this.prisma.client.user.findFirst({
      where: { id: doctorId, tenantId, role: 'DOCTOR' },
      include: { doctorProfile: true },
    });
    if (!doctor) throw new NotFoundException('Doctor no encontrado');
    return this.toPublic(doctor);
  }

  async update(tenantId: string, doctorId: string, dto: UpdateDoctorDto) {
    const doctor = await this.prisma.client.user.findFirst({
      where: { id: doctorId, tenantId, role: 'DOCTOR' },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Doctor no encontrado');

    const updated = await this.prisma.client.user.update({
      where: { id: doctorId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        doctorProfile: {
          update: {
            ...(dto.specialty !== undefined && { specialty: dto.specialty }),
            ...(dto.licenseNumber !== undefined && { licenseNumber: dto.licenseNumber }),
            ...(dto.bio !== undefined && { bio: dto.bio }),
          },
        },
      },
      include: { doctorProfile: true },
    });

    return this.toPublic(updated);
  }

  /**
   * Soft delete: marca el usuario como inactivo. Las citas pasadas conservan referencia.
   * Para borrado físico, el ADMIN debería tener una ruta separada.
   */
  async archive(tenantId: string, doctorId: string) {
    const doctor = await this.prisma.client.user.findFirst({
      where: { id: doctorId, tenantId, role: 'DOCTOR' },
      select: { id: true, isActive: true },
    });
    if (!doctor) throw new NotFoundException('Doctor no encontrado');
    if (!doctor.isActive) throw new BadRequestException('El doctor ya está archivado');

    await this.prisma.client.user.update({
      where: { id: doctorId },
      data: { isActive: false },
    });
    return { success: true };
  }

  private toPublic(d: {
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
    doctorProfile: {
      specialty: string;
      licenseNumber: string | null;
      bio: string | null;
    } | null;
  }) {
    return {
      id: d.id,
      email: d.email,
      name: d.name,
      role: d.role,
      isActive: d.isActive,
      specialty: d.doctorProfile?.specialty ?? null,
      licenseNumber: d.doctorProfile?.licenseNumber ?? null,
      bio: d.doctorProfile?.bio ?? null,
    };
  }
}
