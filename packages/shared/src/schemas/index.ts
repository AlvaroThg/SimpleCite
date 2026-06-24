import { z } from 'zod';

// ─── Enums compartidos (mirror de Prisma) ───

export const UserRole = z.enum(['ADMIN', 'DOCTOR', 'STAFF']);
export type UserRole = z.infer<typeof UserRole>;

export const PaymentMethod = z.enum(['CASH', 'STATIC_QR']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

/** Íconos disponibles para los servicios en la landing (mirror en el frontend). */
export const ServiceIcon = z.enum([
  'stethoscope',
  'heart',
  'activity',
  'baby',
  'bone',
  'eye',
  'pill',
  'brain',
  'syringe',
  'microscope',
  'ear',
  'scan',
]);
export type ServiceIcon = z.infer<typeof ServiceIcon>;

export const AppointmentStatus = z.enum([
  'TENTATIVE', // Reservado durante flujo OTP — expira si no se confirma
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

/** Edición de branding del tenant desde el panel (ADMIN). Campos opcionales. */
export const UpdateTenantBrandingSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    logoUrl: z.string().url('URL de logo inválida').max(500).nullable().optional(),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido (ej: #0EA5A4)')
      .optional(),
    secondaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido')
      .nullable()
      .optional(),
    staticQrUrl: z.string().url('URL de QR inválida').max(500).nullable().optional(),
    heroImageUrl: z.string().url('URL de imagen inválida').max(500).nullable().optional(),
    heroTitle: z.string().max(120).nullable().optional(),
    heroSubtitle: z.string().max(300).nullable().optional(),
    servicesTitle: z.string().max(120).nullable().optional(),
    specialistsTitle: z.string().max(120).nullable().optional(),
    ctaTitle: z.string().max(120).nullable().optional(),
    ctaSubtitle: z.string().max(300).nullable().optional(),
    address: z.string().max(300).nullable().optional(),
    facebookUrl: z.string().url('URL inválida').max(300).nullable().optional(),
    instagramUrl: z.string().url('URL inválida').max(300).nullable().optional(),
    whatsappContact: z.string().max(20).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });
export type UpdateTenantBrandingDto = z.infer<typeof UpdateTenantBrandingSchema>;

// ─── Doctor Schemas ───

export const CreateDoctorSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  name: z.string().min(2).max(100),
  specialty: z.string().min(2).max(100),
  licenseNumber: z.string().max(50).optional(),
  bio: z.string().max(2000).optional(),
});
export type CreateDoctorDto = z.infer<typeof CreateDoctorSchema>;

export const UpdateDoctorSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  specialty: z.string().min(2).max(100).optional(),
  licenseNumber: z.string().max(50).nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDoctorDto = z.infer<typeof UpdateDoctorSchema>;

// ─── Patient Schemas ───

export const CreatePatientSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  phone: z.string().regex(/^591\d{8}$/, 'Formato de teléfono boliviano inválido (ej: 59170000000)'),
  ci: z.string().optional(),
});
export type CreatePatientDto = z.infer<typeof CreatePatientSchema>;

// ─── Service Schemas ───

export const CreateServiceSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  price: z.number().positive('El precio debe ser mayor a 0'),
  duration: z
    .number()
    .int()
    .min(5, 'Duración mínima: 5 minutos')
    .max(480, 'Duración máxima: 8 horas'),
  icon: ServiceIcon.nullable().optional(),
  /// Color hex (#RRGGBB) para las citas del servicio en el calendario del panel.
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido (ej: #0EA5A4)')
    .nullable()
    .optional(),
});
export type CreateServiceDto = z.infer<typeof CreateServiceSchema>;

export const UpdateServiceSchema = CreateServiceSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateServiceDto = z.infer<typeof UpdateServiceSchema>;

// ─── DoctorService (junction) Schemas ───

export const AssignServiceToDoctorSchema = z.object({
  serviceId: z.string().uuid(),
  customDuration: z.number().int().min(5).max(480).optional(),
  customPrice: z.number().positive().optional(),
});
export type AssignServiceToDoctorDto = z.infer<typeof AssignServiceToDoctorSchema>;

export const UpdateDoctorServiceSchema = z.object({
  customDuration: z.number().int().min(5).max(480).nullable().optional(),
  customPrice: z.number().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDoctorServiceDto = z.infer<typeof UpdateDoctorServiceSchema>;

// ─── Schedule Rules Schemas ───

export const ScheduleRuleSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6, 'dayOfWeek: 0 (Dom) … 6 (Sáb)'),
    startMinute: z
      .number()
      .int()
      .min(0)
      .max(1439, 'startMinute: 0…1439 (minutos desde medianoche)'),
    endMinute: z.number().int().min(0).max(1440),
  })
  .refine((d) => d.endMinute > d.startMinute, {
    message: 'endMinute debe ser mayor que startMinute',
    path: ['endMinute'],
  });
export type ScheduleRuleDto = z.infer<typeof ScheduleRuleSchema>;

export const ReplaceScheduleRulesSchema = z.object({
  rules: z.array(ScheduleRuleSchema).max(50),
});
export type ReplaceScheduleRulesDto = z.infer<typeof ReplaceScheduleRulesSchema>;

// ─── Schedule Blocks Schemas ───

export const CreateScheduleBlockSchema = z
  .object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    reason: z.string().max(200).optional(),
  })
  .refine((d) => new Date(d.endTime) > new Date(d.startTime), {
    message: 'endTime debe ser posterior a startTime',
    path: ['endTime'],
  });
export type CreateScheduleBlockDto = z.infer<typeof CreateScheduleBlockSchema>;

// ─── Appointment Schemas ───

export const CreateAppointmentSchema = z
  .object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    patientId: z.string().uuid(),
    doctorId: z.string().uuid(),
    serviceId: z.string().uuid(),
    paymentMethod: PaymentMethod.default('CASH'),
  })
  .refine((d) => new Date(d.endTime) > new Date(d.startTime), {
    message: 'endTime debe ser posterior a startTime',
    path: ['endTime'],
  });
export type CreateAppointmentDto = z.infer<typeof CreateAppointmentSchema>;

export const UpdateAppointmentStatusSchema = z.object({
  status: AppointmentStatus,
});
export type UpdateAppointmentStatusDto = z.infer<typeof UpdateAppointmentStatusSchema>;

/** Reprogramación de una cita (drag&drop / resize en el calendario del panel). */
export const RescheduleAppointmentSchema = z
  .object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
  })
  .refine((d) => new Date(d.endTime) > new Date(d.startTime), {
    message: 'endTime debe ser posterior a startTime',
    path: ['endTime'],
  });
export type RescheduleAppointmentDto = z.infer<typeof RescheduleAppointmentSchema>;

/**
 * Token de cancelación (magic link). 32 bytes aleatorios en hex = 64 chars.
 * Se valida tanto al construir el link como al recibir la petición pública.
 */
export const CancellationTokenSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Token de cancelación inválido');
export type CancellationToken = z.infer<typeof CancellationTokenSchema>;

// ─── Slots Engine Schemas ───

export const SlotsQuerySchema = z.object({
  doctorId: z.string().uuid(),
  serviceId: z.string().uuid(),
  from: z.string().datetime(), // ISO date inicio
  to: z.string().datetime(), // ISO date fin
});
export type SlotsQueryDto = z.infer<typeof SlotsQuerySchema>;

export const SlotSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  available: z.boolean(),
});
export type SlotDto = z.infer<typeof SlotSchema>;

// ─── Medical Note / Clinical Notes Schemas ───

export const CreateMedicalNoteSchema = z.object({
  content: z.string().min(10, 'La nota debe tener al menos 10 caracteres'),
  patientId: z.string().uuid(),
});
export type CreateMedicalNoteDto = z.infer<typeof CreateMedicalNoteSchema>;

/** Crear una nota clínica para un paciente (el patientId va en el path). */
export const CreateClinicalNoteSchema = z.object({
  content: z.string().min(3, 'La nota es muy corta').max(20000),
  /// Opcional: asociar la nota a una cita específica.
  appointmentId: z.string().uuid().optional(),
});
export type CreateClinicalNoteDto = z.infer<typeof CreateClinicalNoteSchema>;

/** Query del historial clínico: rango de fechas + paginación cursor. */
export const PatientHistoryQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export type PatientHistoryQueryDto = z.infer<typeof PatientHistoryQuerySchema>;

/** Query de listado de pacientes: búsqueda + paginación. */
export const PatientListQuerySchema = z.object({
  /// Búsqueda libre por nombre, phone o CI.
  q: z.string().trim().max(100).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export type PatientListQueryDto = z.infer<typeof PatientListQuerySchema>;

// ─── Medical Record (historia clínica estructurada por consulta) ───

/**
 * Upsert de la historia clínica de una cita. El appointmentId va en el path.
 * Todos los campos son opcionales: la consulta se llena progresivamente.
 */
export const UpsertMedicalRecordSchema = z
  .object({
    symptoms: z.string().max(5000).nullable().optional(),
    diagnosis: z.string().max(5000).nullable().optional(),
    treatment: z.string().max(5000).nullable().optional(),
    privateNotes: z.string().max(5000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que guardar' });
export type UpsertMedicalRecordDto = z.infer<typeof UpsertMedicalRecordSchema>;

// ─── Prescription (receta digital) ───

/** Un item de medicación dentro de la receta. */
export const MedicationItemSchema = z.object({
  name: z.string().min(1, 'Nombre del medicamento requerido').max(200),
  dose: z.string().min(1, 'Dosis requerida').max(100), // ej: "500 mg"
  frequency: z.string().min(1, 'Frecuencia requerida').max(100), // ej: "cada 8 horas"
  duration: z.string().min(1, 'Duración requerida').max(100), // ej: "7 días"
  /// Link opcional a un Product del inventario (autocomplete).
  productId: z.string().uuid().optional(),
});
export type MedicationItem = z.infer<typeof MedicationItemSchema>;

/** Crear una receta. El medicalRecordId va en el path. */
export const CreatePrescriptionSchema = z.object({
  medications: z
    .array(MedicationItemSchema)
    .min(1, 'Agrega al menos un medicamento')
    .max(30, 'Máximo 30 medicamentos'),
  instructions: z.string().max(5000).optional(),
});
export type CreatePrescriptionDto = z.infer<typeof CreatePrescriptionSchema>;

// ─── Productos / Inventario ───

export const ProductCategory = z.enum(['MEDICATION', 'SUPPLY', 'OTHER']);
export type ProductCategory = z.infer<typeof ProductCategory>;

export const CreateProductSchema = z.object({
  name: z.string().min(2, 'Nombre muy corto').max(120),
  sku: z.string().max(60).nullable().optional(),
  category: ProductCategory.default('MEDICATION'),
  unit: z.string().min(1).max(30).default('unidad'),
  price: z.number().nonnegative('El precio no puede ser negativo').default(0),
  stock: z.number().int().min(0, 'El stock no puede ser negativo').default(0),
  lowStockThreshold: z.number().int().min(0).nullable().optional(),
});
export type CreateProductDto = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

/** Ajuste de stock (+/-). delta entero; reason opcional para auditoría/log. */
export const AdjustStockSchema = z.object({
  delta: z.number().int(),
  reason: z.string().max(200).optional(),
});
export type AdjustStockDto = z.infer<typeof AdjustStockSchema>;

// ─── Public API: helpers compartidos ───

/**
 * Teléfono en formato E.164 sin '+'. Permisivo para internacional (E.164 = 7-15 dígitos
 * después del código de país). El frontend formatea según país; el backend persiste solo dígitos.
 * Ej: 59170000000 (Bolivia), 14155551234 (USA).
 */
export const PhoneSchema = z
  .string()
  .regex(/^[1-9]\d{7,14}$/, 'Teléfono inválido (E.164 sin +, ej: 59170000000)');

/** Slug de tenant: solo minúsculas, dígitos y guiones. */
export const TenantSlugSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Slug inválido');

// ─── Patient OTP Schemas ───

export const OtpRequestSchema = z.object({
  phone: PhoneSchema,
  turnstileToken: z.string().optional(),
});
export type OtpRequestDto = z.infer<typeof OtpRequestSchema>;

export const OtpVerifySchema = z.object({
  phone: PhoneSchema,
  code: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos'),
});
export type OtpVerifyDto = z.infer<typeof OtpVerifySchema>;

// ─── Public Booking Schemas ───

export const CreatePublicAppointmentSchema = z.object({
  doctorId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startTime: z.string().datetime(),
  patient: z.object({
    name: z.string().min(2).max(100),
    /// Algunos servicios (médico-legales) requieren CI; el resto puede omitirla.
    ci: z.string().max(20).optional(),
  }),
});
export type CreatePublicAppointmentDto = z.infer<typeof CreatePublicAppointmentSchema>;

/** Confirmación de la reserva pública: elige método de pago (efectivo o QR). */
export const ConfirmPublicBookingSchema = z.object({
  paymentMethod: PaymentMethod,
});
export type ConfirmPublicBookingDto = z.infer<typeof ConfirmPublicBookingSchema>;

// ─── Public Tenant Info (response shape, no DTO de input) ───

// ─── Billing / Suscripciones (PayPal) ───

export const LinkSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1, 'subscriptionId requerido'),
  /// El cliente puede enviar tenantId, pero el backend usa el del JWT (se ignora).
  tenantId: z.string().optional(),
});
export type LinkSubscriptionDto = z.infer<typeof LinkSubscriptionSchema>;

// ─── Public Tenant Info (response shape, no DTO de input) ───

export const PublicTenantInfoSchema = z.object({
  slug: TenantSlugSchema,
  name: z.string(),
  logoUrl: z.string().nullable(),
  primaryColor: z.string(),
  secondaryColor: z.string().nullable(),
  heroImageUrl: z.string().nullable(),
  heroTitle: z.string().nullable(),
  heroSubtitle: z.string().nullable(),
  servicesTitle: z.string().nullable(),
  specialistsTitle: z.string().nullable(),
  ctaTitle: z.string().nullable(),
  ctaSubtitle: z.string().nullable(),
  address: z.string().nullable(),
  facebookUrl: z.string().nullable(),
  instagramUrl: z.string().nullable(),
  whatsappContact: z.string().nullable(),
  timezone: z.string(),
  whatsappEnabled: z.boolean(),
});
export type PublicTenantInfo = z.infer<typeof PublicTenantInfoSchema>;
