import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PLAN_INFO, type CreateDoctorDto, type UpdateDoctorDto } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';
import { StorageService } from '../../../../common/services/storage.service';

const SALT_ROUNDS = 10;

@Injectable()
export class DoctorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Sube el QR de cobro del doctor a R2 y guarda la URL en DoctorProfile.qrUrl.
   * Se organiza en una carpeta por slug del tenant: `<slug>/doctors/<doctorId>/`.
   */
  async uploadQr(tenantId: string, doctorId: string, imageBase64: string, mimeType: string) {
    const doctor = await this.prisma.client.user.findFirst({
      where: { id: doctorId, tenantId, role: 'DOCTOR' },
      select: { id: true, tenant: { select: { slug: true } } },
    });
    if (!doctor) throw new NotFoundException('Doctor no encontrado');

    const url = await this.storage.uploadImageFromBase64(
      `${doctor.tenant.slug}/doctors/${doctorId}`,
      imageBase64,
      mimeType,
    );

    const updated = await this.prisma.client.user.update({
      where: { id: doctorId },
      data: { doctorProfile: { update: { qrUrl: url } } },
      include: { doctorProfile: true },
    });
    return this.toPublic(updated);
  }

  /**
   * Sube la foto del especialista a R2 y guarda la URL en DoctorProfile.photoUrl.
   * Misma carpeta por tenant/doctor que el QR: `<slug>/doctors/<doctorId>/`.
   */
  async uploadPhoto(tenantId: string, doctorId: string, imageBase64: string, mimeType: string) {
    const doctor = await this.prisma.client.user.findFirst({
      where: { id: doctorId, tenantId, role: 'DOCTOR' },
      select: { id: true, tenant: { select: { slug: true } } },
    });
    if (!doctor) throw new NotFoundException('Doctor no encontrado');

    const url = await this.storage.uploadImageFromBase64(
      `${doctor.tenant.slug}/doctors/${doctorId}`,
      imageBase64,
      mimeType,
    );

    const updated = await this.prisma.client.user.update({
      where: { id: doctorId },
      data: { doctorProfile: { update: { photoUrl: url } } },
      include: { doctorProfile: true },
    });
    return this.toPublic(updated);
  }

  /**
   * Nombre normalizado para detectar duplicados: sin puntos/espacios extra,
   * sin tildes y en minúsculas ("Dr. Bryan" ≡ "dr bryan" ≡ "Dr Bryan").
   */
  private normalizeName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  async create(tenantId: string, dto: CreateDoctorDto) {
    // Email único dentro del tenant
    const existing = await this.prisma.client.user.findFirst({
      where: { email: dto.email, tenantId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Ya existe un usuario con email ${dto.email}`);
    }

    // Límite de especialistas del plan (Profesional: 10 activos; Clínica: sin
    // límite). Los archivados no cuentan: archivar libera el cupo.
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    const planInfo = PLAN_INFO[tenant?.plan ?? 'PRO'];
    if (planInfo.maxDoctors !== null) {
      const activeCount = await this.prisma.client.user.count({
        where: { tenantId, role: 'DOCTOR', isActive: true },
      });
      if (activeCount >= planInfo.maxDoctors) {
        throw new ConflictException(
          `Tu plan ${planInfo.label} permite hasta ${planInfo.maxDoctors} especialistas activos. ` +
            'Archiva uno que ya no atienda, o pasa al plan Clínica para especialistas ilimitados.',
        );
      }
    }

    // Anti-duplicados: mismo nombre (ignorando puntos, tildes y mayúsculas).
    // Evita el caso "Dr. Bryan" / "Dr Bryan" conviviendo sin que nadie lo note.
    const doctors = await this.prisma.client.user.findMany({
      where: { tenantId, role: 'DOCTOR' },
      select: { name: true, isActive: true },
    });
    const normalized = this.normalizeName(dto.name);
    const dup = doctors.find((d) => this.normalizeName(d.name) === normalized);
    if (dup) {
      throw new ConflictException(
        `Ya existe un doctor con un nombre muy similar: "${dup.name}"${
          dup.isActive ? '' : ' (archivado — puedes reactivarlo desde su edición)'
        }. Usa un nombre distinto si es otra persona.`,
      );
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
            insuranceMode: dto.insuranceMode ?? false,
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
      select: { id: true, email: true },
    });
    if (!doctor) throw new NotFoundException('Doctor no encontrado');

    // Cambio de correo: validar unicidad dentro del tenant.
    if (dto.email !== undefined && dto.email !== doctor.email) {
      const taken = await this.prisma.client.user.findFirst({
        where: { email: dto.email, tenantId, id: { not: doctorId } },
        select: { id: true },
      });
      if (taken) throw new ConflictException(`Ya existe un usuario con email ${dto.email}`);
    }

    // Cambio de contraseña: siempre hasheada, nunca en claro.
    const hashedPassword = dto.password ? await bcrypt.hash(dto.password, SALT_ROUNDS) : undefined;

    const updated = await this.prisma.client.user.update({
      where: { id: doctorId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(hashedPassword && { password: hashedPassword }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        doctorProfile: {
          update: {
            ...(dto.specialty !== undefined && { specialty: dto.specialty }),
            ...(dto.licenseNumber !== undefined && { licenseNumber: dto.licenseNumber }),
            ...(dto.bio !== undefined && { bio: dto.bio }),
            ...(dto.qrUrl !== undefined && { qrUrl: dto.qrUrl }),
            ...(dto.qrLabel !== undefined && { qrLabel: dto.qrLabel }),
            ...(dto.insuranceMode !== undefined && { insuranceMode: dto.insuranceMode }),
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
      qrUrl?: string | null;
      qrLabel?: string | null;
      insuranceMode?: boolean;
      photoUrl?: string | null;
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
      qrUrl: d.doctorProfile?.qrUrl ?? null,
      qrLabel: d.doctorProfile?.qrLabel ?? null,
      insuranceMode: d.doctorProfile?.insuranceMode ?? false,
      photoUrl: d.doctorProfile?.photoUrl ?? null,
    };
  }
}
