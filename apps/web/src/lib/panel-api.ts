/**
 * Cliente del panel profesional (staff/doctor).
 *
 * Todas las llamadas autenticadas envían:
 *   - Authorization: Bearer <jwt>
 *   - x-tenant-slug: <slug>   (el middleware del API resuelve el tenant)
 *
 * El JWT y el slug se guardan en localStorage (ver panel-auth).
 */

import { apiBase } from './api-base';

const BASE = apiBase();

export class PanelApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PanelApiError';
  }
}

// ─── Tipos ───────────────────────────────────────────────────────────

export interface PanelUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'DOCTOR' | 'STAFF';
  tenantId: string;
}

export type PaymentMethod = 'CASH' | 'STATIC_QR' | 'INSURANCE';

export interface AppointmentListItem {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  isPaid: boolean;
  paymentMethod: PaymentMethod;
  receiptUrl: string | null;
  /// Nombre del seguro congelado al crear la cita (solo INSURANCE).
  insuranceNameSnapshot?: string | null;
  patient: { id: string; name: string; phone: string; ci?: string | null };
  doctor: { id: string; name: string };
  service: { id: string; name: string; duration: number; price: string; color?: string | null };
  /** Presente solo en el historial del paciente: marcador de tratamiento. */
  medicalRecord?: { isNewTreatment: boolean; treatmentLabel: string | null } | null;
}

export interface AppointmentDetail extends AppointmentListItem {
  patient: { id: string; name: string; phone: string; ci?: string | null };
}

export interface PatientListItem {
  id: string;
  name: string;
  phone: string;
  ci: string | null;
  createdAt: string;
  _count: { appointments: number };
}

export interface ClinicalNote {
  id: string;
  content: string;
  createdAt: string;
  appointmentId: string | null;
  doctor: { id: string; name: string };
}

export interface PatientHistory {
  patient: { id: string; name: string; phone: string; ci: string | null; createdAt: string };
  appointments: { items: AppointmentListItem[]; nextCursor: string | null; hasMore: boolean };
  notes: ClinicalNote[];
  clinicalAccess: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Auth header helper ──────────────────────────────────────────────

function authHeaders(token: string, slug: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-slug': slug,
  };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PanelApiError(res.status, (body as { message?: string }).message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ────────────────────────────────────────────────────────────

export async function panelLogin(
  slug: string,
  email: string,
  password: string,
): Promise<{ accessToken: string; user: PanelUser }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-slug': slug },
    body: JSON.stringify({ email, password }),
  });
  const json = await handle<{ data: { accessToken: string; user: PanelUser } }>(res);
  return json.data;
}

// ─── Appointments ────────────────────────────────────────────────────

export async function getAppointments(
  token: string,
  slug: string,
  filters?: { status?: string; from?: string; to?: string; patientId?: string },
): Promise<AppointmentListItem[]> {
  const qs = new URLSearchParams(
    Object.entries(filters ?? {}).filter(([, v]) => v) as [string, string][],
  ).toString();
  const res = await fetch(`${BASE}/api/appointments${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(token, slug),
  });
  const json = await handle<{ data: AppointmentListItem[] }>(res);
  return json.data;
}

export async function getAppointment(
  token: string,
  slug: string,
  id: string,
): Promise<AppointmentDetail> {
  const res = await fetch(`${BASE}/api/appointments/${id}`, { headers: authHeaders(token, slug) });
  const json = await handle<{ data: AppointmentDetail }>(res);
  return json.data;
}

export async function transitionAppointment(
  token: string,
  slug: string,
  id: string,
  status: string,
): Promise<void> {
  const res = await fetch(`${BASE}/api/appointments/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders(token, slug),
    body: JSON.stringify({ status }),
  });
  await handle(res);
}

export async function createAppointment(
  token: string,
  slug: string,
  body: {
    patientId: string;
    doctorId: string;
    serviceId: string;
    startTime: string;
    endTime: string;
    paymentMethod?: PaymentMethod;
    /// Requerido cuando paymentMethod=INSURANCE.
    tenantInsuranceId?: string;
  },
): Promise<AppointmentListItem> {
  const res = await fetch(`${BASE}/api/appointments`, {
    method: 'POST',
    headers: authHeaders(token, slug),
    body: JSON.stringify(body),
  });
  const json = await handle<{ data: AppointmentListItem }>(res);
  return json.data;
}

export const approvePayment = (token: string, slug: string, id: string) =>
  transitionAppointment(token, slug, id, 'CONFIRMED');

/** Descarga el informe PDF de una cita (formato APA, Inter, logo del tenant). */
export async function downloadAppointmentReport(
  token: string,
  slug: string,
  appointmentId: string,
): Promise<void> {
  const res = await fetch(`${BASE}/api/appointments/${appointmentId}/report`, {
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': slug },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PanelApiError(
      res.status,
      (body as { message?: string }).message ?? 'No se pudo generar el informe',
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `informe-cita-${appointmentId.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Reprograma una cita (drag&drop / resize del calendario del panel). */
export async function rescheduleAppointment(
  token: string,
  slug: string,
  id: string,
  start: Date,
  end: Date,
): Promise<void> {
  const res = await fetch(`${BASE}/api/appointments/${id}/reschedule`, {
    method: 'PATCH',
    headers: authHeaders(token, slug),
    body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString() }),
  });
  await handle(res);
}

// ─── Patients + EHR ──────────────────────────────────────────────────

/** Alta de paciente desde el panel (walk-in). Dedup por phone/ci en el backend. */
export async function createPatient(
  token: string,
  slug: string,
  body: { name: string; phone: string; ci?: string },
): Promise<PatientListItem> {
  const res = await fetch(`${BASE}/api/patients`, {
    method: 'POST',
    headers: authHeaders(token, slug),
    body: JSON.stringify(body),
  });
  const json = await handle<{ data: PatientListItem }>(res);
  return json.data;
}

export async function getPatients(
  token: string,
  slug: string,
  query?: { q?: string; cursor?: string; limit?: number },
): Promise<Page<PatientListItem>> {
  const qs = new URLSearchParams(
    Object.entries(query ?? {})
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  const res = await fetch(`${BASE}/api/patients${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(token, slug),
  });
  return handle<Page<PatientListItem>>(res);
}

export async function getPatientHistory(
  token: string,
  slug: string,
  patientId: string,
  opts?: { doctorId?: string; cursor?: string },
): Promise<PatientHistory> {
  const qs = new URLSearchParams();
  if (opts?.doctorId) qs.set('doctorId', opts.doctorId);
  if (opts?.cursor) qs.set('cursor', opts.cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${BASE}/api/patients/${patientId}/history${suffix}`, {
    headers: authHeaders(token, slug),
  });
  const json = await handle<{ data: PatientHistory }>(res);
  return json.data;
}

export async function createNote(
  token: string,
  slug: string,
  patientId: string,
  content: string,
  appointmentId?: string,
): Promise<ClinicalNote> {
  const res = await fetch(`${BASE}/api/patients/${patientId}/notes`, {
    method: 'POST',
    headers: authHeaders(token, slug),
    body: JSON.stringify({ content, appointmentId }),
  });
  const json = await handle<{ data: ClinicalNote }>(res);
  return json.data;
}

// ─── Medical Records + Prescriptions (Consulta en curso) ────────────

export interface MedicationItem {
  name: string;
  dose: string;
  frequency: string;
  duration: string;
  /** Vínculo opcional a un producto del inventario. */
  productId?: string;
}

export interface PrescriptionItem {
  id: string;
  medications: MedicationItem[];
  instructions: string | null;
  createdAt: string;
}

export interface MedicalRecord {
  id: string;
  symptoms: string | null;
  diagnosis: string | null;
  treatment: string | null;
  privateNotes: string | null;
  isNewTreatment: boolean;
  treatmentLabel: string | null;
  createdAt: string;
  updatedAt: string;
  doctor: { id: string; name: string };
  prescriptions: PrescriptionItem[];
}

export interface MedicalRecordInput {
  symptoms?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  privateNotes?: string | null;
  isNewTreatment?: boolean;
  treatmentLabel?: string | null;
}

/** Historia clínica de una cita (null si aún no se creó). */
export async function getMedicalRecord(
  token: string,
  slug: string,
  appointmentId: string,
): Promise<MedicalRecord | null> {
  const res = await fetch(`${BASE}/api/appointments/${appointmentId}/medical-record`, {
    headers: authHeaders(token, slug),
  });
  const json = await handle<{ data: MedicalRecord | null }>(res);
  return json.data;
}

/** Crea o actualiza la historia clínica de la cita (upsert). */
export async function saveMedicalRecord(
  token: string,
  slug: string,
  appointmentId: string,
  body: MedicalRecordInput,
): Promise<MedicalRecord> {
  const res = await fetch(`${BASE}/api/appointments/${appointmentId}/medical-record`, {
    method: 'PUT',
    headers: authHeaders(token, slug),
    body: JSON.stringify(body),
  });
  const json = await handle<{ data: MedicalRecord }>(res);
  return json.data;
}

/** Crea una receta dentro de una historia clínica. */
export async function createPrescription(
  token: string,
  slug: string,
  recordId: string,
  body: { medications: MedicationItem[]; instructions?: string },
): Promise<PrescriptionItem> {
  const res = await fetch(`${BASE}/api/medical-records/${recordId}/prescriptions`, {
    method: 'POST',
    headers: authHeaders(token, slug),
    body: JSON.stringify(body),
  });
  const json = await handle<{ data: PrescriptionItem }>(res);
  return json.data;
}

/** Descarga el PDF de una receta (autenticado) y dispara la descarga. */
export async function downloadPrescriptionPdf(
  token: string,
  slug: string,
  prescriptionId: string,
): Promise<void> {
  const res = await fetch(`${BASE}/api/prescriptions/${prescriptionId}/pdf`, {
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': slug },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PanelApiError(
      res.status,
      (body as { message?: string }).message ?? 'No se pudo generar el PDF',
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receta-${prescriptionId.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Helpers genéricos (CRUD del dashboard) ──────────────────────────

async function req<T>(
  method: string,
  path: string,
  token: string,
  slug: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(token, slug),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return handle<T>(res);
}
const get = <T>(p: string, t: string, s: string) => req<T>('GET', p, t, s);
const post = <T>(p: string, t: string, s: string, b?: unknown) => req<T>('POST', p, t, s, b);
const patch = <T>(p: string, t: string, s: string, b?: unknown) => req<T>('PATCH', p, t, s, b);
const del = <T>(p: string, t: string, s: string) => req<T>('DELETE', p, t, s);

// ─── Slots (disponibilidad del doctor) ───────────────────────────────
// Mismo motor que usa el Web Booking, pero autenticado (staff). Devuelve los
// bloques del doctor en [from, to] con `available` según reglas, bloqueos y
// citas existentes. Se usa en "Nueva cita" del panel para no dejar elegir un
// horario fuera de agenda u ocupado.

export interface PanelSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export const getSlots = (
  t: string,
  s: string,
  params: { doctorId: string; serviceId: string; from: string; to: string },
) =>
  get<{ data: PanelSlot[] }>(`/api/slots?${new URLSearchParams(params).toString()}`, t, s).then(
    (r) => r.data,
  );

// ─── Reports ──────────────────────────────────────────────────────────

export interface ReportInsuranceRow {
  name: string;
  count: number;
  /// Valor referencial (precio de lista) — el paciente pagó Bs 0.
  referentialValue: number;
}

export interface ReportsSummary {
  citasHoy: number;
  ingresosMes: number;
  tasaInasistencia: number;
  proximasCitas: {
    id: string;
    startTime: string;
    patientName: string;
    doctorName: string;
    serviceName: string;
  }[];
}
export const getReportsSummary = (t: string, s: string) =>
  get<{ data: ReportsSummary }>('/api/reports/summary', t, s).then((r) => r.data);

// ─── Reportes: analítica por rango (solo ADMIN) ──────────────────────
export interface ReportDoctorRow {
  doctorId: string;
  doctorName: string;
  income: number;
  completed: number;
  cancelled: number;
  noShow: number;
  total: number;
}
export interface ReportAnalytics {
  from: string;
  to: string;
  totals: { income: number; completed: number; cancelled: number; noShow: number; total: number };
  /// Ingreso real por método de cobro (los seguros nunca suman aquí).
  incomeByMethod: { cash: number; qr: number };
  /// Columnas dinámicas por seguro presente en el período (snapshots).
  byInsurance: ReportInsuranceRow[];
  byDoctor: ReportDoctorRow[];
  incomeOverTime: { date: string; income: number }[];
}
export const getReportsAnalytics = (t: string, s: string, from?: string, to?: string) => {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return get<{ data: ReportAnalytics }>(`/api/reports/analytics${suffix}`, t, s).then(
    (r) => r.data,
  );
};

/** Descarga el PDF del reporte del período (autenticado) y dispara la descarga. */
export async function downloadReportsPdf(
  token: string,
  slug: string,
  from?: string,
  to?: string,
): Promise<void> {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${BASE}/api/reports/analytics/pdf${suffix}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': slug },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PanelApiError(
      res.status,
      (body as { message?: string }).message ?? 'No se pudo generar el reporte',
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reporte.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Tenant config / branding ─────────────────────────────────────────

export interface TenantConfig {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  staticQrUrl: string | null;
  staticQrLabel: string | null;
  staticQrUrl2: string | null;
  staticQrLabel2: string | null;
  qrAssignmentMode: 'SHARED' | 'PER_DOCTOR';
  heroImageUrl: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  servicesTitle: string | null;
  specialistsTitle: string | null;
  ctaTitle: string | null;
  ctaSubtitle: string | null;
  address: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  whatsappContact: string | null;
  timezone: string;
  plan: string;
  whatsappEnabled: boolean;
}
export const getTenantConfig = (t: string, s: string) =>
  get<{ data: TenantConfig }>('/api/tenants/current', t, s).then((r) => r.data);
export const updateTenantBranding = (
  t: string,
  s: string,
  body: {
    name?: string;
    logoUrl?: string | null;
    primaryColor?: string;
    secondaryColor?: string | null;
    staticQrUrl?: string | null;
    staticQrLabel?: string | null;
    staticQrUrl2?: string | null;
    staticQrLabel2?: string | null;
    qrAssignmentMode?: 'SHARED' | 'PER_DOCTOR';
    heroImageUrl?: string | null;
    heroTitle?: string | null;
    heroSubtitle?: string | null;
    servicesTitle?: string | null;
    specialistsTitle?: string | null;
    ctaTitle?: string | null;
    ctaSubtitle?: string | null;
    address?: string | null;
    facebookUrl?: string | null;
    instagramUrl?: string | null;
    whatsappContact?: string | null;
  },
) => patch<{ data: TenantConfig }>('/api/tenants/current', t, s, body).then((r) => r.data);

export const uploadTenantAsset = (
  t: string,
  s: string,
  body: {
    type: 'logo' | 'static-qr' | 'static-qr-2' | 'hero';
    imageBase64: string;
    mimeType: string;
  },
) => post<{ data: TenantConfig }>('/api/tenants/current/assets', t, s, body).then((r) => r.data);

// ─── Billing / Suscripción (gestión manual, sin pasarela) ─────────────

export interface BillingStatus {
  subscriptionStatus: string; // TRIAL | ACTIVE | PAST_DUE | CANCELED
  subscriptionEndDate: string | null;
  plan: string;
}
export const getBillingStatus = (t: string, s: string) =>
  get<{ data: BillingStatus }>('/api/billing/status', t, s).then((r) => r.data);

// ─── Doctores ─────────────────────────────────────────────────────────

export interface Doctor {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  specialty: string | null;
  licenseNumber: string | null;
  bio: string | null;
  qrUrl: string | null;
  qrLabel: string | null;
  /// Modo seguro: las citas de este doctor van por seguro médico, sin cobro.
  insuranceMode: boolean;
  /// Foto del especialista (R2). Null = avatar de iniciales.
  photoUrl: string | null;
}
export const getDoctorsAdmin = (t: string, s: string) =>
  get<{ data: Doctor[] }>('/api/doctors', t, s).then((r) => r.data);
export const createDoctor = (
  t: string,
  s: string,
  body: {
    email: string;
    password: string;
    name: string;
    specialty: string;
    licenseNumber?: string;
    bio?: string;
  },
) => post<{ data: Doctor }>('/api/doctors', t, s, body).then((r) => r.data);
export const updateDoctor = (t: string, s: string, id: string, body: Record<string, unknown>) =>
  patch<{ data: Doctor }>(`/api/doctors/${id}`, t, s, body).then((r) => r.data);
/** Sube el QR de cobro del doctor a R2 (carpeta por slug del tenant). */
export const uploadDoctorQr = (
  t: string,
  s: string,
  id: string,
  body: { imageBase64: string; mimeType: string },
) => post<{ data: Doctor }>(`/api/doctors/${id}/qr`, t, s, body).then((r) => r.data);
/** Sube la foto del especialista a R2 (mismo patrón que el QR). */
export const uploadDoctorPhoto = (
  t: string,
  s: string,
  id: string,
  body: { imageBase64: string; mimeType: string },
) => post<{ data: Doctor }>(`/api/doctors/${id}/photo`, t, s, body).then((r) => r.data);
export const archiveDoctor = (t: string, s: string, id: string) =>
  del<{ success: boolean }>(`/api/doctors/${id}`, t, s);

// Asignaciones doctor ↔ servicio
export interface DoctorServiceLink {
  id: string;
  serviceId: string;
  customDuration: number | null;
  customPrice: string | null;
  service: ServiceItem;
}
export const getDoctorServices = (t: string, s: string, doctorId: string) =>
  get<{ data: DoctorServiceLink[] }>(`/api/services/doctors/${doctorId}`, t, s).then((r) => r.data);
export const assignServiceToDoctor = (
  t: string,
  s: string,
  doctorId: string,
  body: { serviceId: string; customDuration?: number },
) =>
  post<{ data: DoctorServiceLink }>(`/api/services/doctors/${doctorId}/assign`, t, s, body).then(
    (r) => r.data,
  );
export const unassignServiceFromDoctor = (t: string, s: string, linkId: string) =>
  del<{ success: boolean }>(`/api/services/assignments/${linkId}`, t, s);
/** Override de duración/precio del servicio para un doctor concreto (null = usa el default). */
export const updateDoctorService = (
  t: string,
  s: string,
  linkId: string,
  body: { customDuration?: number | null; customPrice?: number | null },
) =>
  patch<{ data: DoctorServiceLink }>(`/api/services/assignments/${linkId}`, t, s, body).then(
    (r) => r.data,
  );

// ─── Seguros médicos (Addendum G) ─────────────────────────────────────

export interface TenantInsurance {
  id: string;
  name: string;
  isActive: boolean;
}
/** Seguro del catálogo activo + si está asignado a un doctor (checkboxes). */
export interface DoctorInsuranceOption {
  id: string;
  name: string;
  assigned: boolean;
}

export const getTenantInsurances = (t: string, s: string) =>
  get<{ data: TenantInsurance[] }>('/api/tenant-insurances', t, s).then((r) => r.data);
export const createTenantInsurance = (t: string, s: string, body: { name: string }) =>
  post<{ data: TenantInsurance }>('/api/tenant-insurances', t, s, body).then((r) => r.data);
export const updateTenantInsurance = (
  t: string,
  s: string,
  id: string,
  body: { name?: string; isActive?: boolean },
) =>
  patch<{ data: TenantInsurance }>(`/api/tenant-insurances/${id}`, t, s, body).then((r) => r.data);

export const getDoctorInsurances = (t: string, s: string, doctorId: string) =>
  get<{ data: DoctorInsuranceOption[] }>(`/api/doctors/${doctorId}/insurances`, t, s).then(
    (r) => r.data,
  );
export const setDoctorInsurance = (
  t: string,
  s: string,
  doctorId: string,
  body: { tenantInsuranceId: string; isActive: boolean },
) =>
  put<{ data: DoctorInsuranceOption[] }>(`/api/doctors/${doctorId}/insurances`, t, s, body).then(
    (r) => r.data,
  );

// ─── Servicios ────────────────────────────────────────────────────────

export interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  duration: number;
  isActive: boolean;
  icon: string | null;
  color: string | null;
}
export const getServices = (t: string, s: string) =>
  get<{ data: ServiceItem[] }>('/api/services', t, s).then((r) => r.data);
export const createService = (
  t: string,
  s: string,
  body: {
    name: string;
    description?: string;
    price: number;
    duration: number;
    icon?: string | null;
    color?: string | null;
  },
) => post<{ data: ServiceItem }>('/api/services', t, s, body).then((r) => r.data);
export const updateService = (t: string, s: string, id: string, body: Record<string, unknown>) =>
  patch<{ data: ServiceItem }>(`/api/services/${id}`, t, s, body).then((r) => r.data);
export const deleteService = (t: string, s: string, id: string) =>
  del<{ success: boolean }>(`/api/services/${id}`, t, s);

// ─── Productos / Inventario ───────────────────────────────────────────

export type ProductCategory = 'MEDICATION' | 'SUPPLY' | 'OTHER';

export interface ProductItem {
  id: string;
  name: string;
  sku: string | null;
  category: ProductCategory;
  unit: string;
  price: string;
  stock: number;
  lowStockThreshold: number | null;
  isActive: boolean;
}

export interface ProductInput {
  name: string;
  sku?: string | null;
  category: ProductCategory;
  unit: string;
  price: number;
  stock: number;
  lowStockThreshold?: number | null;
}

export const getProducts = (t: string, s: string, includeInactive = false) =>
  get<{ data: ProductItem[] }>(
    `/api/products${includeInactive ? '?includeInactive=true' : ''}`,
    t,
    s,
  ).then((r) => r.data);
export const createProduct = (t: string, s: string, body: ProductInput) =>
  post<{ data: ProductItem }>('/api/products', t, s, body).then((r) => r.data);
export const updateProduct = (
  t: string,
  s: string,
  id: string,
  body: Partial<ProductInput> & { isActive?: boolean },
) => patch<{ data: ProductItem }>(`/api/products/${id}`, t, s, body).then((r) => r.data);
export const adjustStock = (t: string, s: string, id: string, delta: number) =>
  post<{ data: ProductItem }>(`/api/products/${id}/stock`, t, s, { delta }).then((r) => r.data);
export const deleteProduct = (t: string, s: string, id: string) =>
  del<{ success: boolean }>(`/api/products/${id}`, t, s);

// ─── Horarios (rules + blocks) ────────────────────────────────────────

export interface ScheduleRule {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}
export const getRules = (t: string, s: string, doctorId: string) =>
  get<{ data: ScheduleRule[] }>(`/api/schedule/doctors/${doctorId}/rules`, t, s).then(
    (r) => r.data,
  );
export const replaceRules = (
  t: string,
  s: string,
  doctorId: string,
  rules: { dayOfWeek: number; startMinute: number; endMinute: number }[],
) =>
  put<{ data: ScheduleRule[] }>(`/api/schedule/doctors/${doctorId}/rules`, t, s, { rules }).then(
    (r) => r.data,
  );

export interface ScheduleBlock {
  id: string;
  startTime: string;
  endTime: string;
  reason: string | null;
}
export const getBlocks = (t: string, s: string, doctorId: string) =>
  get<{ data: ScheduleBlock[] }>(`/api/schedule/doctors/${doctorId}/blocks`, t, s).then(
    (r) => r.data,
  );
export const createBlock = (
  t: string,
  s: string,
  doctorId: string,
  body: { startTime: string; endTime: string; reason?: string },
) =>
  post<{ data: ScheduleBlock }>(`/api/schedule/doctors/${doctorId}/blocks`, t, s, body).then(
    (r) => r.data,
  );
export const deleteBlock = (t: string, s: string, blockId: string) =>
  del<{ success: boolean }>(`/api/schedule/blocks/${blockId}`, t, s);

// ─── WhatsApp (instancias) ────────────────────────────────────────────

export interface WaInstance {
  id: string;
  status: string;
  containerName: string;
  phone: string | null;
  lastSeen: string | null;
}
export const getWaInstances = (t: string, s: string) =>
  get<{ data: WaInstance[] }>('/api/admin/whatsapp/instances', t, s).then((r) => r.data);
export const createWaInstance = (t: string, s: string) =>
  post<{ data: WaInstance }>('/api/admin/whatsapp/instances', t, s).then((r) => r.data);
export const restartWaInstance = (t: string, s: string, id: string) =>
  post<{ data: WaInstance }>(`/api/admin/whatsapp/instances/${id}/restart`, t, s);
export const deleteWaInstance = (t: string, s: string, id: string) =>
  del<{ success: boolean }>(`/api/admin/whatsapp/instances/${id}`, t, s);

// `put` no estaba arriba; lo definimos aquí para replaceRules.
function put<T>(p: string, t: string, s: string, b?: unknown) {
  return req<T>('PUT', p, t, s, b);
}
