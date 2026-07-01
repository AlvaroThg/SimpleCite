'use client';

import { useEffect, useId, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  getDoctors,
  getTenantInfo,
  getAvailability,
  createBooking,
  confirmBooking,
  ApiError,
  type DoctorWithServices,
  type Slot,
  type TenantInfo,
} from '@/lib/api';
import { readableOn } from '@/lib/tenant-color';
import { BookingCalendar } from '@/components/calendar/BookingCalendar';
import { PaymentQRSelector, type BankQr } from '@/components/PaymentQRSelector';
import { TurnstileWidget } from '@/components/TurnstileWidget';

// ─── Types ────────────────────────────────────────────────────────────

type DoctorService = DoctorWithServices['doctorServices'][number];

type Step =
  | 'select-doctor'
  | 'select-service'
  | 'select-slot'
  | 'patient-info'
  | 'payment-method'
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
  appointmentId: string;
  chosenMethod: '' | 'CASH' | 'STATIC_QR'; // método de pago elegido al confirmar
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

/** Resumen inequívoco de un turno: fecha · inicio–fin · duración (en tz del tenant). */
function slotSummary(startIso: string, endIso: string, tz: string): string {
  const dur = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  return `${formatDate(startIso, tz)} · ${formatTime(startIso, tz)}–${formatTime(endIso, tz)} · ${dur} min`;
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
    appointmentId: '',
    chosenMethod: '',
    loading: true,
    error: '',
  });

  const set = (patch: Partial<State>) => setState((prev) => ({ ...prev, ...patch, error: '' }));

  // Vista del paso de horario: lista de turnos o calendario interactivo.
  const [slotView, setSlotView] = useState<'list' | 'calendar'>('list');

  // Token de Turnstile (anti-bot). Solo se rellena si hay site key configurada;
  // si no, queda vacío y el backend lo trata como no-op en dev.
  const [turnstileToken, setTurnstileToken] = useState('');

  // Movimiento reducido: las transiciones de paso se vuelven instantáneas.
  const reduce = useReducedMotion();
  const EASE = [0.16, 1, 0.3, 1] as const;

  // ─── Carga inicial ─────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([getTenantInfo(slug), getDoctors(slug)])
      .then(([tenant, doctors]) => set({ tenant, doctors, loading: false }))
      .catch(() =>
        set({ error: 'Error al cargar la clínica. Intenta más tarde.', loading: false }),
      );
  }, [slug]);

  // ─── Disponibilidad al cambiar doctor/servicio ──────────────────────
  // Traemos 4 semanas de entrada (la lista usa 7 días; el calendario puede
  // navegar varias semanas sin recargar). Al navegar más allá, loadRange()
  // trae y fusiona el rango faltante.
  useEffect(() => {
    const { selectedDoctor, selectedService } = state;
    if (!selectedDoctor || !selectedService) return;

    set({ loading: true, slots: [], selectedSlot: null, availableDates: [] });

    const from = new Date(todayStr() + 'T00:00:00').toISOString();
    const to = new Date(addDays(todayStr(), 27) + 'T23:59:59').toISOString();

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

  // Carga incremental: al navegar el calendario a un rango aún no cargado,
  // trae esa franja y la fusiona (dedupe por startTime). No bloquea ni resetea.
  async function loadRange(from: Date, to: Date) {
    const { selectedDoctor, selectedService } = state;
    if (!selectedDoctor || !selectedService) return;
    try {
      const fetched = await getAvailability(slug, {
        doctorId: selectedDoctor.id,
        serviceId: selectedService.service.id,
        from: from.toISOString(),
        to: to.toISOString(),
      });
      setState((prev) => {
        const seen = new Set(prev.slots.map((s) => s.startTime));
        const merged = [...prev.slots, ...fetched.filter((s) => !seen.has(s.startTime))];
        const zone = prev.tenant?.timezone ?? 'America/La_Paz';
        const availableDates = Array.from(
          new Set(merged.filter((s) => s.available).map((s) => localDateStr(s.startTime, zone))),
        );
        return { ...prev, slots: merged, availableDates };
      });
    } catch {
      /* silencioso: no romper la navegación del calendario */
    }
  }

  const primary = state.tenant?.primaryColor ?? '#3B82F6';
  const tz = state.tenant?.timezone ?? 'America/La_Paz';
  const daySlots = state.slots.filter((s) => localDateStr(s.startTime, tz) === state.selectedDate);

  // QR bancarios a mostrar al pagar. En modo PER_DOCTOR se usa el QR del doctor
  // de la cita; si el doctor no tiene QR propio, cae al QR del tenant. En modo
  // SHARED (default) se usan los 1-2 QR de la clínica.
  const qrBanks: BankQr[] = [];
  const perDoctorQr =
    state.tenant?.qrAssignmentMode === 'PER_DOCTOR'
      ? state.selectedDoctor?.doctorProfile?.qrUrl
      : null;
  if (perDoctorQr) {
    qrBanks.push({
      id: 'doctor-qr',
      name: state.selectedDoctor?.doctorProfile?.qrLabel || state.selectedDoctor?.name || 'Banco',
      qrUrl: perDoctorQr,
    });
  } else {
    if (state.tenant?.staticQrUrl) {
      qrBanks.push({
        id: 'qr1',
        name: state.tenant.staticQrLabel || 'Banco',
        qrUrl: state.tenant.staticQrUrl,
      });
    }
    if (state.tenant?.staticQrUrl2) {
      qrBanks.push({
        id: 'qr2',
        name: state.tenant.staticQrLabel2 || 'Otro banco',
        qrUrl: state.tenant.staticQrUrl2,
      });
    }
  }

  // ─── Acciones ──────────────────────────────────────────────────────

  /**
   * Crea la reserva directamente (flujo abierto sin OTP) y pasa al paso de pago.
   * El teléfono y el token de Turnstile (anti-bot) viajan en el body.
   */
  async function handleCreateBooking() {
    set({ loading: true });
    try {
      const booking = await createBooking(slug, {
        doctorId: state.selectedDoctor!.id,
        serviceId: state.selectedService!.service.id,
        startTime: state.selectedSlot!.startTime,
        phone: state.phone,
        patient: {
          name: state.patientName,
          ci: state.patientCi || undefined,
        },
        turnstileToken: turnstileToken || undefined,
      });

      set({
        appointmentId: booking.appointmentId,
        step: 'payment-method',
        loading: false,
      });
    } catch (e) {
      set({
        error: e instanceof ApiError ? e.message : 'No se pudo registrar la reserva',
        loading: false,
      });
    }
  }

  /** Finaliza la reserva con el método de pago elegido. */
  async function handleConfirm(method: 'CASH' | 'STATIC_QR') {
    set({ loading: true });
    try {
      await confirmBooking(slug, state.appointmentId, method, state.phone);
      set({ chosenMethod: method, step: 'confirmed', loading: false });
    } catch (e) {
      set({
        error: e instanceof ApiError ? e.message : 'No se pudo confirmar la cita',
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

  // El paso de horario en vista calendario se ensancha (como el del panel).
  const wideStep = state.step === 'select-slot' && slotView === 'calendar';

  return (
    <div className={`mx-auto px-4 py-8 space-y-6 ${wideStep ? 'max-w-5xl' : 'max-w-2xl'}`}>
      {/* Stepper visual — oculto en el primer paso para dar aire al hero */}
      {state.step !== 'select-doctor' && <Stepper step={state.step} primary={primary} />}

      {/* Error banner */}
      {state.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {state.error}
        </div>
      )}

      {/* Transición continua entre pasos (cross-fade + deslizamiento). */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state.step}
          className="space-y-6"
          initial={reduce ? false : { opacity: 0, x: 24 }}
          animate={reduce ? {} : { opacity: 1, x: 0 }}
          exit={reduce ? {} : { opacity: 0, x: -24 }}
          transition={{ duration: 0.32, ease: EASE }}
        >
          {/* ── Paso 1: Hero + Nuestros Especialistas (landing) ── */}
          {state.step === 'select-doctor' && (
            <>
              <section className="space-y-3 py-2 text-center">
                <h1 className="text-3xl font-bold text-gray-900">
                  Reserva tu cita{state.tenant ? ` en ${state.tenant.name}` : ''}
                </h1>
                <p className="mx-auto max-w-md text-gray-500">
                  Agenda online en menos de un minuto. Elige a tu especialista y tu horario; la
                  clínica confirma tu cita.
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
            <StepCard
              title="¿Qué servicio necesitas?"
              onBack={() => set({ step: 'select-doctor' })}
            >
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
            <StepCard
              title="¿Cuándo quieres tu cita?"
              onBack={() => set({ step: 'select-service' })}
            >
              {/* Toggle Lista / Calendario */}
              <div className="mb-4 flex w-fit gap-1 rounded-lg bg-gray-100 p-1">
                {(
                  [
                    ['list', 'Lista'],
                    ['calendar', 'Calendario'],
                  ] as ['list' | 'calendar', string][]
                ).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setSlotView(k)}
                    aria-pressed={slotView === k}
                    className={`min-h-9 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      slotView === k
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {slotView === 'calendar' ? (
                <BookingCalendar
                  slots={state.slots.map((s) => ({
                    start: new Date(s.startTime),
                    end: new Date(s.endTime),
                    available: s.available,
                  }))}
                  onPick={({ start }) => {
                    const slot = state.slots.find(
                      (s) => new Date(s.startTime).getTime() === start.getTime(),
                    );
                    if (slot) set({ selectedSlot: slot, step: 'patient-info' });
                  }}
                  onRangeChange={(from, to) => void loadRange(from, to)}
                />
              ) : (
                <>
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
                          className={`flex-shrink-0 min-h-11 rounded-xl px-3 py-2 text-sm font-medium border transition ${
                            isSelected
                              ? 'text-white border-transparent'
                              : disabled
                                ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 opacity-60'
                                : 'bg-white border-gray-200 text-gray-700 hover:border-blue-400'
                          }`}
                          style={
                            isSelected ? { backgroundColor: primary, borderColor: primary } : {}
                          }
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {state.selectedService && (
                    <p className="mb-3 text-sm text-gray-500">
                      <span className="font-medium text-gray-700">
                        {state.selectedService.service.name}
                      </span>{' '}
                      ·{' '}
                      {state.selectedService.customDuration ??
                        state.selectedService.service.duration}{' '}
                      min · horarios en la zona de la clínica
                    </p>
                  )}
                  {state.loading ? (
                    <p className="text-gray-400 text-center py-6 animate-pulse">
                      Buscando horarios...
                    </p>
                  ) : daySlots.length === 0 ? (
                    <p className="text-gray-500 text-center py-6">
                      No hay turnos disponibles este día. Elige otro.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {daySlots.map((slot) => (
                        <motion.button
                          key={slot.startTime}
                          disabled={!slot.available}
                          onClick={() => set({ selectedSlot: slot, step: 'patient-info' })}
                          // Cupos disponibles: feedback de pulsación con resorte.
                          // Ocupados: inertes (sin hover ni tap) para no malgastar toques.
                          whileTap={!slot.available || reduce ? undefined : { scale: 0.94 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          className={`min-h-11 rounded-xl px-1 py-2 text-[13px] font-medium border transition ${
                            !slot.available
                              ? 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 opacity-60'
                              : 'bg-white border-gray-200 text-gray-800 hover:border-blue-400 hover:shadow-sm'
                          }`}
                        >
                          {formatTime(slot.startTime, tz)}–{formatTime(slot.endTime, tz)}
                        </motion.button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </StepCard>
          )}

          {/* ── Paso 4: Datos del paciente + teléfono ── */}
          {state.step === 'patient-info' && state.selectedSlot && (
            <StepCard title="Tus datos" onBack={() => set({ step: 'select-slot' })}>
              <div className="bg-blue-50 rounded-xl p-3 mb-5 text-sm font-medium text-blue-800">
                {slotSummary(state.selectedSlot.startTime, state.selectedSlot.endTime, tz)}
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
                  label="Número de teléfono"
                  value={state.phone}
                  onChange={(v) => set({ phone: v })}
                  placeholder="Ej: 59170000000"
                  type="tel"
                  required
                />
                <p className="text-xs text-gray-500">
                  Lo usaremos para coordinar tu cita. No se comparte con terceros.
                </p>

                <TurnstileWidget onToken={setTurnstileToken} />

                <Btn
                  label="Continuar al pago"
                  color={primary}
                  loading={state.loading}
                  disabled={!state.patientName.trim() || !/^[1-9]\d{7,14}$/.test(state.phone)}
                  onClick={handleCreateBooking}
                />
              </div>
            </StepCard>
          )}

          {/* ── Paso 5: Elegir método de pago ── */}
          {state.step === 'payment-method' && state.selectedSlot && (
            <StepCard title="¿Cómo deseas pagar?">
              <div className="bg-blue-50 rounded-xl p-3 mb-5 text-sm text-blue-800">
                <span className="font-medium">{state.selectedDoctor?.name}</span>
                <br />
                <span className="font-medium">
                  {slotSummary(state.selectedSlot.startTime, state.selectedSlot.endTime, tz)}
                </span>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => handleConfirm('CASH')}
                  disabled={state.loading}
                  className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-blue-400 hover:shadow-sm active:scale-[.99] disabled:opacity-50"
                >
                  <span className="text-2xl">💵</span>
                  <div>
                    <p className="font-semibold text-gray-900">Efectivo (en la clínica)</p>
                    <p className="text-sm text-gray-500">Reserva tu cita y paga al llegar.</p>
                  </div>
                </button>

                <button
                  onClick={() => handleConfirm('STATIC_QR')}
                  disabled={state.loading}
                  className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-blue-400 hover:shadow-sm active:scale-[.99] disabled:opacity-50"
                >
                  <span className="text-2xl">📲</span>
                  <div>
                    <p className="font-semibold text-gray-900">QR bancario</p>
                    <p className="text-sm text-gray-500">
                      {qrBanks.length > 0
                        ? 'Escanea el QR con tu banco y paga al instante.'
                        : 'Coordina el pago por QR con la clínica.'}
                    </p>
                  </div>
                </button>
              </div>

              {state.loading && (
                <p className="mt-3 text-center text-sm text-gray-400">Procesando…</p>
              )}
            </StepCard>
          )}

          {/* ── Paso 7: Confirmado ── */}
          {state.step === 'confirmed' && state.selectedSlot && (
            <StepCard title="">
              <div className="text-center space-y-4 py-4">
                <CheckDraw color={primary} reduce={!!reduce} />
                <h2 className="text-2xl font-bold text-gray-900">
                  {state.chosenMethod === 'STATIC_QR' ? '¡Cita registrada!' : '¡Cita confirmada!'}
                </h2>
                <p className="text-gray-600">
                  Tu cita con <span className="font-semibold">{state.selectedDoctor?.name}</span>:
                  <br />
                  <span className="font-semibold">
                    {slotSummary(state.selectedSlot.startTime, state.selectedSlot.endTime, tz)}
                  </span>
                </p>
                {state.chosenMethod === 'STATIC_QR' ? (
                  qrBanks.length > 0 ? (
                    <div className="space-y-3">
                      {/* Espera calmada del pago: pulso suave en lugar de spinner. */}
                      <div className="animate-qr-wait rounded-2xl">
                        <PaymentQRSelector banks={qrBanks} />
                      </div>
                      <p className="text-sm text-gray-500">
                        Escanea el QR con la app de tu banco y realiza el pago. La clínica{' '}
                        <span className="font-semibold">confirmará tu cita</span> cuando el pago se
                        vea reflejado.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
                      Tu cita quedó registrada. Coordina el{' '}
                      <span className="font-semibold">pago con la clínica</span>; se confirmará
                      cuando el pago se registre.
                    </div>
                  )
                ) : (
                  <p className="text-sm text-gray-500">
                    💵 Tu cita quedó registrada. Paga en efectivo en la clínica el día de tu cita.
                  </p>
                )}
                <button
                  className="mt-4 text-sm underline text-gray-500"
                  onClick={() => router.push(`/${slug}`)}
                >
                  Volver al inicio
                </button>
              </div>
            </StepCard>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

const STEPS: Step[] = [
  'select-doctor',
  'select-service',
  'select-slot',
  'patient-info',
  'payment-method',
  'confirmed',
];

function Stepper({ step, primary }: { step: Step; primary: string }) {
  const idx = STEPS.indexOf(step);
  const labels = ['Doctor', 'Servicio', 'Horario', 'Datos', 'Pago', '¡Listo!'];
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1 flex-shrink-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all"
            style={
              i <= idx
                ? { backgroundColor: primary, borderColor: primary, color: readableOn(primary) }
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

/**
 * Marca de confirmación con trazo animado (~600ms) — el momento emocional más
 * importante del flujo. Con movimiento reducido aparece ya dibujada.
 */
function CheckDraw({ color, reduce }: { color: string; reduce: boolean }) {
  return (
    <motion.div
      className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
      style={{ backgroundColor: color }}
      initial={reduce ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 22 }}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
        <motion.path
          d="M5 13l4 4L19 7"
          stroke={readableOn(color)}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: reduce ? 0 : 0.15 }}
        />
      </svg>
    </motion.div>
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 active:scale-95"
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
      className="w-14 h-14 rounded-full flex items-center justify-center font-semibold text-lg flex-shrink-0"
      style={{ backgroundColor: color, color: readableOn(color) }}
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
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        id={id}
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
      className="w-full py-3 rounded-xl font-semibold text-base transition disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
      style={{ backgroundColor: color, color: readableOn(color) }}
    >
      {loading ? 'Procesando...' : label}
    </button>
  );
}
