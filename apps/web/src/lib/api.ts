/**
 * Cliente tipado para la API pública de SimpleCite.
 *
 * La base URL se resuelve según contexto (servidor vs navegador) en `apiBase()`,
 * porque el SSR corre dentro del contenedor y el navegador en el host.
 *
 * Las funciones de servidor (usadas en Server Components / route handlers) pueden
 * pasarle opciones `next` de Next.js para ISR:
 *   `{ next: { revalidate: 3600 } }`
 *
 * Las funciones de cliente (wizard) no pasan `next`.
 */

import { apiBase } from './api-base';

const BASE = apiBase();

// ─── Tipos (mirror de shared, sin importar el paquete para no crear dep circular) ───

export interface TenantInfo {
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
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
  staticQrUrl: string | null;
  staticQrLabel: string | null;
  staticQrUrl2: string | null;
  staticQrLabel2: string | null;
  timezone: string;
  whatsappEnabled: boolean;
}

export interface DoctorWithServices {
  id: string;
  name: string;
  doctorProfile: { specialty: string; bio: string | null } | null;
  doctorServices: {
    id: string;
    customDuration: number | null;
    customPrice: string | null;
    service: {
      id: string;
      name: string;
      description: string | null;
      duration: number;
      price: string;
      icon: string | null;
    };
  }[];
}

export interface Slot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface BookingResult {
  appointmentId: string;
  expiresAt: string;
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';

export interface PaymentIntentResult {
  intentId: string;
  amount: number;
  currency: string;
  qrPayload: string;
  expiresAt: string;
  status: PaymentStatus;
}

export interface PaymentStatusResult {
  intentId: string;
  status: PaymentStatus;
  appointmentStatus: string;
  amount: number;
  currency: string;
  expiresAt: string;
  paidAt: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

async function apiGet<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? res.statusText);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (err as { message?: string }).message ?? res.statusText);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Public Tenant API ───────────────────────────────────────────────

export async function getTenantInfo(slug: string, opts?: RequestInit): Promise<TenantInfo> {
  return apiGet<TenantInfo>(`/api/public/tenants/${slug}`, opts);
}

export async function getDoctors(slug: string, opts?: RequestInit): Promise<DoctorWithServices[]> {
  return apiGet<DoctorWithServices[]>(`/api/public/tenants/${slug}/doctors`, opts);
}

export async function getAvailability(
  slug: string,
  params: { doctorId: string; serviceId: string; from: string; to: string },
): Promise<Slot[]> {
  const qs = new URLSearchParams(params).toString();
  return apiGet<Slot[]>(`/api/public/tenants/${slug}/availability?${qs}`);
}

// ─── Patient OTP API ─────────────────────────────────────────────────

export async function requestOtp(
  slug: string,
  phone: string,
  turnstileToken?: string,
): Promise<{ success: true; expiresInSeconds: number }> {
  return apiPost(`/api/public/tenants/${slug}/otp/request`, { phone, turnstileToken });
}

export async function verifyOtp(
  slug: string,
  phone: string,
  code: string,
): Promise<{ sessionToken: string }> {
  return apiPost(`/api/public/tenants/${slug}/otp/verify`, { phone, code });
}

// ─── Public Booking API ──────────────────────────────────────────────

export async function createBooking(
  slug: string,
  sessionToken: string,
  payload: {
    doctorId: string;
    serviceId: string;
    startTime: string;
    patient: { name: string; ci?: string };
  },
): Promise<BookingResult> {
  return apiPost(`/api/public/tenants/${slug}/appointments`, payload, sessionToken);
}

export async function confirmBooking(
  slug: string,
  sessionToken: string,
  appointmentId: string,
  paymentMethod: 'CASH' | 'STATIC_QR',
): Promise<{ id: string; status: string }> {
  return apiPost(
    `/api/public/tenants/${slug}/appointments/${appointmentId}/confirm`,
    { paymentMethod },
    sessionToken,
  );
}

// ─── Public Cancellation (magic link) ───────────────────────────────

export interface CancelAppointmentResult {
  status: 'CANCELLED';
  /** true si la cita ya estaba cancelada (link abierto dos veces). */
  alreadyCancelled: boolean;
  startTime: string;
  tenantName: string;
  doctorName: string;
  serviceName: string;
}

/**
 * Cancela una cita con su token de magic link. No requiere auth ni slug:
 * el token identifica la cita. POST /api/public/appointments/cancel/:token
 */
export async function cancelAppointment(token: string): Promise<CancelAppointmentResult> {
  return apiPost<CancelAppointmentResult>(
    `/api/public/appointments/cancel/${encodeURIComponent(token)}`,
    {},
  );
}

// ─── Payments API ────────────────────────────────────────────────────

export async function createPayment(
  slug: string,
  sessionToken: string,
  appointmentId: string,
): Promise<PaymentIntentResult> {
  return apiPost(
    `/api/public/tenants/${slug}/appointments/${appointmentId}/payment`,
    {},
    sessionToken,
  );
}

export async function getPaymentStatus(
  slug: string,
  sessionToken: string,
  intentId: string,
): Promise<PaymentStatusResult> {
  return apiGet(`/api/public/tenants/${slug}/payments/${intentId}`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
}
