/**
 * Cliente del panel profesional (staff/doctor).
 *
 * Todas las llamadas autenticadas envían:
 *   - Authorization: Bearer <jwt>
 *   - x-tenant-slug: <slug>   (el middleware del API resuelve el tenant)
 *
 * El JWT y el slug se guardan en localStorage (ver panel-auth).
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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

export interface AppointmentListItem {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  isPaid: boolean;
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
