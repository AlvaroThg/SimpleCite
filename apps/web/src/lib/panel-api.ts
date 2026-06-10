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

export type PaymentMethod = 'CASH' | 'STATIC_QR';

export interface AppointmentListItem {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  isPaid: boolean;
  paymentMethod: PaymentMethod;
  receiptUrl: string | null;
  patient: { id: string; name: string; phone: string };
  doctor: { id: string; name: string };
  service: { id: string; name: string; duration: number; price: string };
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

// ─── Patients + EHR ──────────────────────────────────────────────────

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
): Promise<PatientHistory> {
  const res = await fetch(`${BASE}/api/patients/${patientId}/history`, {
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

// ─── Reports ──────────────────────────────────────────────────────────

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

// ─── Tenant config / branding ─────────────────────────────────────────

export interface TenantConfig {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  staticQrUrl: string | null;
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
  body: { type: 'logo' | 'static-qr' | 'hero'; imageBase64: string; mimeType: string },
) => post<{ data: TenantConfig }>('/api/tenants/current/assets', t, s, body).then((r) => r.data);

// ─── Billing / Suscripción (PayPal) ───────────────────────────────────

export interface BillingStatus {
  paypalSubscriptionId: string | null;
  subscriptionStatus: string; // TRIAL | ACTIVE | PAST_DUE | CANCELED
  subscriptionEndDate: string | null;
  plan: string;
}
export const getBillingStatus = (t: string, s: string) =>
  get<{ data: BillingStatus }>('/api/billing/status', t, s).then((r) => r.data);
export const linkSubscription = (t: string, s: string, subscriptionId: string) =>
  post<{ data: BillingStatus }>('/api/billing/link-subscription', t, s, { subscriptionId }).then(
    (r) => r.data,
  );

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
export const archiveDoctor = (t: string, s: string, id: string) =>
  del<{ success: boolean }>(`/api/doctors/${id}`, t, s);

// Asignaciones doctor ↔ servicio
export interface DoctorServiceLink {
  id: string;
  serviceId: string;
  customDuration: number | null;
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

// ─── Servicios ────────────────────────────────────────────────────────

export interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  duration: number;
  isActive: boolean;
  icon: string | null;
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
  },
) => post<{ data: ServiceItem }>('/api/services', t, s, body).then((r) => r.data);
export const updateService = (t: string, s: string, id: string, body: Record<string, unknown>) =>
  patch<{ data: ServiceItem }>(`/api/services/${id}`, t, s, body).then((r) => r.data);
export const deleteService = (t: string, s: string, id: string) =>
  del<{ success: boolean }>(`/api/services/${id}`, t, s);

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
