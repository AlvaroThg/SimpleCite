'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import {
  getDoctors,
  getTenantInfo,
  getAvailability,
  requestOtp,
  verifyOtp,
  createBooking,
  createPayment,
  getPaymentStatus,
  ApiError,
  type DoctorWithServices,
  type Slot,
  type TenantInfo,
} from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────

type DoctorService = DoctorWithServices['doctorServices'][number];

type Step =
  | 'select-doctor'
  | 'select-service'
  | 'select-slot'
  | 'patient-info'
  | 'verify-otp'
  | 'payment'
  | 'confirmed';

interface State {
  step: Step;
  tenant: TenantInfo | null;
  doctors: DoctorWithServices[];
  selectedDoctor: DoctorWithServices | null;
  selectedService: DoctorService | null;
  selectedDate: string; // YYYY-MM-DD local
  slots: Slot[]; // slots de toda la semana visible (incluye ocupados)
  availableDates: string[]; // fechas YYYY-MM-DD con al menos un cupo libre
  selectedSlot: Slot | null;
  patientName: string;
  patientCi: string;
  phone: string;
  otpCode: string;
  sessionToken: string;
  appointmentId: string;
  // ── Pago ──
  intentId: string;
  qrDataUrl: string; // imagen del QR (data:image/png;base64)
  amount: number;
  paymentExpiresAt: string;
  paymentExpired: boolean;
  loading: boolean;
  error: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatTime(isoStr: string, tz: string) {
  return new Intl.DateTimeFormat('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
    hour12: false,
  }).format(new Date(isoStr));
}

function formatDate(isoStr: string, tz: string) {
  return new Intl.DateTimeFormat('es-BO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(new Date(isoStr));
}

/** Fecha local (YYYY-MM-DD) de un instante ISO en la timezone del tenant. */
function localDateStr(isoStr: string, tz: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).format(new Date(isoStr));
}

// ─── Component ────────────────────────────────────────────────────────

export default function BookingWizard() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [state, setState] = useState<State>({
    step: 'select-doctor',
    tenant: null,
    doctors: [],
    selectedDoctor: null,
    selectedService: null,
    selectedDate: todayStr(),
    slots: [],
    availableDates: [],
    selectedSlot: null,
    patientName: '',
    patientCi: '',
    phone: '',
    otpCode: '',
    sessionToken: '',
    appointmentId: '',
    intentId: '',
    qrDataUrl: '',
    amount: 0,
    paymentExpiresAt: '',
    paymentExpired: false,
    loading: true,
    error: '',
  });

  const set = (patch: Partial<State>) => setState((prev) => ({ ...prev, ...patch, error: '' }));

  // ─── Carga inicial ─────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([getTenantInfo(slug), getDoctors(slug)])
      .then(([tenant, doctors]) => set({ tenant, doctors, loading: false }))
      .catch(() =>
        set({ error: 'Error al cargar la clínica. Intenta más tarde.', loading: false }),
      );
  }, [slug]);

  // ─── Disponibilidad de toda la semana al cambiar doctor/servicio ──────
  // Traemos el rango completo (hoy..+6d) una sola vez para poder deshabilitar
  // las FECHAS sin cupo y mostrar los horarios ocupados grisados por día.
  useEffect(() => {
    const { selectedDoctor, selectedService } = state;
    if (!selectedDoctor || !selectedService) return;

    set({ loading: true, slots: [], selectedSlot: null, availableDates: [] });

    const from = new Date(todayStr() + 'T00:00:00').toISOString();
    const to = new Date(addDays(todayStr(), 6) + 'T23:59:59').toISOString();

    getAvailability(slug, {
      doctorId: selectedDoctor.id,
      serviceId: selectedService.service.id,
      from,
      to,
    })
      .then((slots) => {
        const zone = state.tenant?.timezone ?? 'America/La_Paz';
        const availableDates = Array.from(
          new Set(slots.filter((s) => s.available).map((s) => localDateStr(s.startTime, zone))),
        );
        set({ slots, availableDates, loading: false });
      })
      .catch(() => set({ error: 'No se pudo cargar la disponibilidad.', loading: false }));
  }, [slug, state.selectedDoctor?.id, state.selectedService?.service.id]);

  // ─── Polling del estado de pago (cada 3s mientras step === 'payment') ──
  useEffect(() => {
    if (state.step !== 'payment' || !state.intentId || state.paymentExpired) return;

    const interval = setInterval(async () => {
      try {
        const st = await getPaymentStatus(slug, state.sessionToken, state.intentId);
        if (st.status === 'PAID') {
          set({ step: 'confirmed' });
        } else if (st.status === 'EXPIRED' || st.status === 'FAILED') {
          set({ paymentExpired: true });
        }
      } catch {
        // Error transitorio de red — el próximo tick reintenta.
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [state.step, state.intentId, state.paymentExpired, slug, state.sessionToken]);

  // ─── Ticker de 1s para el countdown de expiración ──────────────────
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (state.step !== 'payment') return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.step]);

  // Marcar expirado cuando el countdown llega a 0
  useEffect(() => {
    if (state.step === 'payment' && state.paymentExpiresAt && !state.paymentExpired) {
      if (new Date(state.paymentExpiresAt).getTime() - nowTick <= 0) {
        set({ paymentExpired: true });
      }
    }
  }, [nowTick, state.step, state.paymentExpiresAt, state.paymentExpired]);

  const primary = state.tenant?.primaryColor ?? '#3B82F6';
  const tz = state.tenant?.timezone ?? 'America/La_Paz';
  const daySlots = state.slots.filter((s) => localDateStr(s.startTime, tz) === state.selectedDate);
  const secondsLeft =
    state.paymentExpiresAt && !state.paymentExpired
      ? Math.max(0, Math.floor((new Date(state.paymentExpiresAt).getTime() - nowTick) / 1000))
      : 0;

  // ─── Acciones ──────────────────────────────────────────────────────

  async function handleRequestOtp() {
    set({ loading: true });
    try {
      await requestOtp(slug, state.phone);
      set({ step: 'verify-otp', loading: false });
    } catch (e) {
      set({
        error: e instanceof ApiError ? e.message : 'Error al enviar el código',
        loading: false,
      });
    }
  }

  async function handleVerifyAndBook() {
    set({ loading: true });
    try {
      const { sessionToken } = await verifyOtp(slug, state.phone, state.otpCode);

      const booking = await createBooking(slug, sessionToken, {
        doctorId: state.selectedDoctor!.id,
        serviceId: state.selectedService!.service.id,
        startTime: state.selectedSlot!.startTime,
        patient: {
          name: state.patientName,
          ci: state.patientCi || undefined,
        },
      });

      // Generar el intent de pago + QR
      const payment = await createPayment(slug, sessionToken, booking.appointmentId);
      const qrDataUrl = await QRCode.toDataURL(payment.qrPayload, { width: 280, margin: 1 });

      set({
        sessionToken,
        appointmentId: booking.appointmentId,
        intentId: payment.intentId,
        amount: payment.amount,
        paymentExpiresAt: payment.expiresAt,
        qrDataUrl,
        paymentExpired: false,
        step: 'payment',
        loading: false,
      });
    } catch (e) {
      set({
        error: e instanceof ApiError ? e.message : 'Error al generar el pago',
        loading: false,
      });
    }
  }

  /**
   * Reintento de pago: genera un nuevo intent (el backend expira el anterior)
   * y refresca el QR + timer.
   */
  async function handleRetryPayment() {
    set({ loading: true, paymentExpired: false });
    try {
      const payment = await createPayment(slug, state.sessionToken, state.appointmentId);
      const qrDataUrl = await QRCode.toDataURL(payment.qrPayload, { width: 280, margin: 1 });
      set({
        intentId: payment.intentId,
        amount: payment.amount,
        paymentExpiresAt: payment.expiresAt,
        qrDataUrl,
        paymentExpired: false,
        loading: false,
      });
    } catch (e) {
      set({
        error: e instanceof ApiError ? e.message : 'Error al regenerar el pago',
        loading: false,
      });
    }
  }

  // ─── Render ────────────────────────────────────────────────────────

  if (state.loading && state.step === 'select-doctor') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 min-h-[60vh] text-gray-400">
        <svg
          className="animate-spin"
          style={{ color: primary }}
          width={36}
          height={36}
          viewBox="0 0 24 24"
          fill="none"
          role="status"
          aria-label="Cargando"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="4"
          />
          <path
            d="M22 12a10 10 0 0 0-10-10"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        <p className="text-sm">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Stepper visual — oculto en el primer paso para dar aire al hero */}
      {state.step !== 'select-doctor' && <Stepper step={state.step} primary={primary} />}

      {/* Error banner */}
      {state.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {state.error}
        </div>
      )}

      {/* ── Paso 1: Hero + Nuestros Especialistas (landing) ── */}
      {state.step === 'select-doctor' && (
        <>
          <section className="space-y-3 py-2 text-center">
            <h1 className="text-3xl font-bold text-gray-900">
              Reserva tu cita{state.tenant ? ` en ${state.tenant.name}` : ''}
            </h1>
            <p className="mx-auto max-w-md text-gray-500">
              Agenda online en menos de un minuto. Elige a tu especialista y tu horario; te
              confirmamos por WhatsApp.
            </p>
          </section>

          <StepCard title="Nuestros especialistas">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {state.doctors.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() =>
                    set({ selectedDoctor: doc, selectedService: null, step: 'select-service' })
                  }
                  className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md"
                >
                  <Avatar name={doc.name} color={primary} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{doc.name}</p>
                    {doc.doctorProfile?.specialty && (
                      <p className="truncate text-sm text-gray-500">
                        {doc.doctorProfile.specialty}
                      </p>
                    )}
                    {doc.doctorServices.length > 0 && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        {doc.doctorServices.length} servicio
                        {doc.doctorServices.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </StepCard>
        </>
      )}

      {/* ── Paso 2: Elegir servicio ── */}
      {state.step === 'select-service' && state.selectedDoctor && (
        <StepCard title="¿Qué servicio necesitas?" onBack={() => set({ step: 'select-doctor' })}>
          <div className="space-y-3">
            {state.selectedDoctor.doctorServices.map((ds) => (
              <button
                key={ds.id}
                onClick={() => set({ selectedService: ds, step: 'select-slot' })}
                className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-400 hover:shadow-sm transition"
              >
                <p className="font-semibold text-gray-900">{ds.service.name}</p>
                {ds.service.description && (
                  <p className="text-sm text-gray-500 mt-1">{ds.service.description}</p>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  Bs {Number(ds.customPrice ?? ds.service.price).toFixed(0)} ·{' '}
                  {ds.customDuration ?? ds.service.duration} min
                </p>
              </button>
            ))}
          </div>
        </StepCard>
      )}

      {/* ── Paso 3: Elegir fecha y slot ── */}
      {state.step === 'select-slot' && state.selectedService && (
        <StepCard title="¿Cuándo quieres tu cita?" onBack={() => set({ step: 'select-service' })}>
          {/* Date picker simple: botones ±7 días */}
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
            {Array.from({ length: 7 }, (_, i) => addDays(todayStr(), i)).map((d) => {
              const label = new Intl.DateTimeFormat('es-BO', {
                weekday: 'short',
                day: 'numeric',
                timeZone: tz,
              }).format(new Date(d + 'T12:00:00'));
              const isSelected = state.selectedDate === d;
              const disabled = !state.loading && !state.availableDates.includes(d);
              return (
                <button
                  key={d}
                  disabled={disabled}
                  onClick={() => set({ selectedDate: d })}
                  className={`flex-shrink-0 rounded-xl px-3 py-2 text-sm font-medium border transition ${
                    isSelected
                      ? 'text-white border-transparent'
                      : disabled
                        ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 opacity-60'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-blue-400'
                  }`}
                  style={isSelected ? { backgroundColor: primary, borderColor: primary } : {}}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {state.loading ? (
            <p className="text-gray-400 text-center py-6 animate-pulse">Buscando horarios...</p>
          ) : daySlots.length === 0 ? (
            <p className="text-gray-500 text-center py-6">
              No hay turnos disponibles este día. Elige otro.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {daySlots.map((slot) => (
                <button
                  key={slot.startTime}
                  disabled={!slot.available}
                  onClick={() => set({ selectedSlot: slot, step: 'patient-info' })}
                  className={`rounded-xl py-2 text-sm font-medium border transition ${
                    !slot.available
                      ? 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 opacity-60'
                      : 'bg-white border-gray-200 text-gray-800 hover:border-blue-400 hover:shadow-sm'
                  }`}
                >
                  {formatTime(slot.startTime, tz)}
                </button>
              ))}
            </div>
          )}
        </StepCard>
      )}

      {/* ── Paso 4: Datos del paciente + teléfono ── */}
      {state.step === 'patient-info' && state.selectedSlot && (
        <StepCard title="Tus datos" onBack={() => set({ step: 'select-slot' })}>
          <div className="bg-blue-50 rounded-xl p-3 mb-5 text-sm text-blue-800">
            <span className="font-medium">{formatDate(state.selectedSlot.startTime, tz)}</span> a
            las <span className="font-medium">{formatTime(state.selectedSlot.startTime, tz)}</span>
          </div>

          <div className="space-y-4">
            <Field
              label="Tu nombre completo"
              value={state.patientName}
              onChange={(v) => set({ patientName: v })}
              placeholder="Ej: Juan Pérez"
              required
            />
            <Field
              label="Cédula de identidad (opcional)"
              value={state.patientCi}
              onChange={(v) => set({ patientCi: v })}
              placeholder="Ej: 1234567"
            />
            <Field
              label="Teléfono WhatsApp (con código de país, sin +)"
              value={state.phone}
              onChange={(v) => set({ phone: v })}
              placeholder="Ej: 59170000000"
              type="tel"
              required
            />
            <p className="text-xs text-gray-500">
              Te enviaremos un código de verificación a tu WhatsApp para confirmar la cita.
            </p>

            <Btn
              label="Recibir código por WhatsApp"
              color={primary}
              loading={state.loading}
              disabled={!state.patientName.trim() || !/^[1-9]\d{7,14}$/.test(state.phone)}
              onClick={handleRequestOtp}
            />
          </div>
        </StepCard>
      )}

      {/* ── Paso 5: Verificar OTP ── */}
      {state.step === 'verify-otp' && (
        <StepCard title="Verifica tu WhatsApp" onBack={() => set({ step: 'patient-info' })}>
          <p className="text-gray-600 text-sm mb-5">
            Enviamos un código de 6 dígitos al número{' '}
            <span className="font-semibold">{state.phone}</span>. Revisa tus mensajes de WhatsApp.
          </p>

          <div className="space-y-4">
            <Field
              label="Código de verificación"
              value={state.otpCode}
              onChange={(v) => set({ otpCode: v.replace(/\D/g, '').slice(0, 6) })}
              placeholder="000000"
              type="text"
              inputMode="numeric"
              maxLength={6}
            />

            <Btn
              label="Continuar al pago"
              color={primary}
              loading={state.loading}
              disabled={state.otpCode.length !== 6}
              onClick={handleVerifyAndBook}
            />

            <button
              className="w-full text-sm text-gray-500 underline text-center"
              onClick={() => set({ step: 'patient-info', otpCode: '' })}
            >
              No recibí el código, volver
            </button>
          </div>
        </StepCard>
      )}

      {/* ── Paso 6: Pago QR ── */}
      {state.step === 'payment' && (
        <StepCard title="Escanea para pagar">
          <div className="text-center space-y-4">
            <p className="text-gray-600 text-sm">
              Abre tu app de banca o billetera y escanea el código QR para pagar.
            </p>

            <div className="flex flex-col items-center gap-2">
              <div className="text-3xl font-bold text-gray-900">Bs {state.amount.toFixed(2)}</div>

              {state.paymentExpired ? (
                <div className="w-[280px] h-[280px] flex flex-col items-center justify-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 gap-3">
                  <span className="text-4xl">⏰</span>
                  <p className="text-gray-500 text-sm px-6">
                    El código de pago expiró. Genera uno nuevo para continuar.
                  </p>
                </div>
              ) : (
                <>
                  <img
                    src={state.qrDataUrl}
                    alt="Código QR de pago"
                    className="w-[280px] h-[280px] rounded-2xl border border-gray-100"
                  />
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">Expira en</span>
                    <span
                      className="font-mono font-bold tabular-nums"
                      style={{ color: secondsLeft < 60 ? '#dc2626' : primary }}
                    >
                      {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    Esperando confirmación del pago...
                  </div>
                </>
              )}
            </div>

            {state.paymentExpired && (
              <Btn
                label="Generar nuevo código"
                color={primary}
                loading={state.loading}
                disabled={state.loading}
                onClick={handleRetryPayment}
              />
            )}

            <button
              className="w-full text-sm text-gray-500 underline text-center"
              onClick={() => router.push(`/${slug}`)}
            >
              Cancelar y volver
            </button>
          </div>
        </StepCard>
      )}

      {/* ── Paso 7: Confirmado ── */}
      {state.step === 'confirmed' && state.selectedSlot && (
        <StepCard title="">
          <div className="text-center space-y-4 py-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-3xl mx-auto"
              style={{ backgroundColor: primary }}
            >
              ✓
            </div>
            <h2 className="text-2xl font-bold text-gray-900">¡Cita confirmada!</h2>
            <p className="text-gray-600">
              Tu cita con <span className="font-semibold">{state.selectedDoctor?.name}</span> está
              agendada para el{' '}
              <span className="font-semibold">{formatDate(state.selectedSlot.startTime, tz)}</span>{' '}
              a las{' '}
              <span className="font-semibold">{formatTime(state.selectedSlot.startTime, tz)}</span>.
            </p>
            <p className="text-sm text-gray-500">
              Recibirás un recordatorio por WhatsApp el día anterior.
            </p>
            <button
              className="mt-4 text-sm underline text-gray-500"
              onClick={() => router.push(`/${slug}`)}
            >
              Volver al inicio
            </button>
          </div>
        </StepCard>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

const STEPS: Step[] = [
  'select-doctor',
  'select-service',
  'select-slot',
  'patient-info',
  'verify-otp',
  'payment',
  'confirmed',
];

function Stepper({ step, primary }: { step: Step; primary: string }) {
  const idx = STEPS.indexOf(step);
  const labels = ['Doctor', 'Servicio', 'Horario', 'Datos', 'OTP', 'Pago', '¡Listo!'];
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1 flex-shrink-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all"
            style={
              i <= idx
                ? { backgroundColor: primary, borderColor: primary, color: '#fff' }
                : { backgroundColor: '#fff', borderColor: '#d1d5db', color: '#9ca3af' }
            }
          >
            {i < idx ? '✓' : i + 1}
          </div>
          <span
            className={`text-xs hidden sm:block ${i <= idx ? 'text-gray-800 font-medium' : 'text-gray-400'}`}
          >
            {labels[i]}
          </span>
          {i < STEPS.length - 1 && <div className="w-4 h-px bg-gray-200 flex-shrink-0" />}
        </div>
      ))}
    </div>
  );
}

function StepCard({
  title,
  children,
  onBack,
}: {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-gray-700 transition text-lg"
            aria-label="Volver"
          >
            ←
          </button>
        )}
        {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
      </div>
      {children}
    </div>
  );
}

function Avatar({ name, color }: { name: string; color: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('');
  return (
    <div
      className="w-14 h-14 rounded-full flex items-center justify-center text-white font-semibold text-lg flex-shrink-0"
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  maxLength,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: 'numeric' | 'tel';
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
      />
    </div>
  );
}

function Btn({
  label,
  color,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full py-3 rounded-xl text-white font-semibold text-base transition disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
      style={{ backgroundColor: color }}
    >
      {loading ? 'Procesando...' : label}
    </button>
  );
}
