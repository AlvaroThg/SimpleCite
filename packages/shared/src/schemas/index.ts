import { z } from 'zod';

// ─── Enums compartidos (mirror de Prisma) ───

export const UserRole = z.enum(['ADMIN', 'DOCTOR', 'STAFF']);
export type UserRole = z.infer<typeof UserRole>;

export const AppointmentStatus = z.enum([
  'PENDING_PAYMENT',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);
export type AppointmentStatus = z.infer<typeof AppointmentStatus>;

export const SubscriptionPlan = z.enum(['BASIC', 'PRO', 'ELITE']);
export type SubscriptionPlan = z.infer<typeof SubscriptionPlan>;

export const TenantStatus = z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED']);
export type TenantStatus = z.infer<typeof TenantStatus>;

// ─── Auth Schemas ───

export const LoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const RegisterSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  role: UserRole.default('DOCTOR'),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

// ─── Tenant Schemas ───

export const CreateTenantSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
  name: z.string().min(2).max(100),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido')
    .default('#3B82F6'),
  plan: SubscriptionPlan.default('BASIC'),
});
export type CreateTenantDto = z.infer<typeof CreateTenantSchema>;

// ─── Patient Schemas ───

export const CreatePatientSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  phone: z
    .string()
    .regex(/^591\d{8}$/, 'Formato de teléfono boliviano inválido (ej: 59170000000)'),
  ci: z.string().optional(),
});
export type CreatePatientDto = z.infer<typeof CreatePatientSchema>;

// ─── Service Schemas ───

export const CreateServiceSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  price: z.number().positive('El precio debe ser mayor a 0'),
  duration: z.number().int().min(5, 'Duración mínima: 5 minutos').max(480, 'Duración máxima: 8 horas'),
});
export type CreateServiceDto = z.infer<typeof CreateServiceSchema>;

// ─── Appointment Schemas ───

export const CreateAppointmentSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  serviceId: z.string().uuid(),
});
export type CreateAppointmentDto = z.infer<typeof CreateAppointmentSchema>;

// ─── Medical Note Schemas ───

export const CreateMedicalNoteSchema = z.object({
  content: z.string().min(10, 'La nota debe tener al menos 10 caracteres'),
  patientId: z.string().uuid(),
});
export type CreateMedicalNoteDto = z.infer<typeof CreateMedicalNoteSchema>;
