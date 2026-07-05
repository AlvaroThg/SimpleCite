'use client';

import { useEffect, useId, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  getDoctors,
  getTenantInfo,
  getAvailability,
  createBooking,
  confirmBooking,
  lookupPatient,
  ApiError,
  type DoctorWithServices,
  type Slot,
  type TenantInfo,
} from '@/lib/api';
import { readableOn } from '@/lib/tenant-color';
import { BookingCalendar } from '@/components/calendar/BookingCalendar';
import { PaymentQRSelector, type BankQr } from '@/components/PaymentQRSelector';
import { TurnstileWidget } from '@/components/TurnstileWidget';
import { PhoneField } from '@/components/PhoneField';

// ─── Types ────────────────────────────────────────────────────────────

type DoctorService = DoctorWithServices['doctorServices'][number];

type Step =
  | 'select-doctor'
  | 'select-service'
  | 'select-slot'
  | 'patient-type' // ¿paciente nuevo o regresante?
  | 'patient-info' // nuevo: nombre + CI + teléfono
  | 'patient-lookup' // regresante: buscar historial por CI
  | 'payment-method'
  | 'select-insurance' // doctor en modo seguro: reemplaza al paso de pago
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
  chosenMethod: '' | 'CASH' | 'STATIC_QR' | 'INSURANCE'; // método elegido al confirmar
  selectedInsurance: { id: string; name: string } | null; // seguro elegido (modo seguro)
  patientMode: '' | 'new' | 'returning'; // ¿paciente nuevo o regresante?
  lookupCi: string; // CI ingresado en el lookup de regresante
  foundPatient: { id: string; firstName: string } | null; // match del lookup
  lookupDone: boolean; // ya se buscó (para mostrar "no encontrado")
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

// ─── Persistencia del wizard ──────────────────────────────────────────
// Si el paciente refresca a mitad de la reserva (p.ej. en el paso de pago),
// no pierde su progreso ni la cita TENTATIVE que ya bloqueó el slot. Se guarda
// lo mínimo en sessionStorage y expira junto con el TTL de la reserva.

const WIZARD_TTL_MS = 15 * 60 * 1000;

interface SavedWizard {
  savedAt: number;
  step: Step;
  doctorId: string;
  serviceId: string;
  selectedSlot: Slot | null;
  patientName: string;
  patientCi: string;
  phone: string;
  appointmentId: string;
  chosenMethod: State['chosenMethod'];
  selectedInsurance: State['selectedInsurance'];
  patientMode: State['patientMode'];
  foundPatient: State['foundPatient'];
}

function wizardKey(slug: string) {
  return `sc-booking-${slug}`;
}

function loadWizard(slug: string): SavedWizard | null {
  try {
    const raw = sessionStorage.getItem(wizardKey(slug));
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedWizard;
    if (Date.now() - saved.savedAt > WIZARD_TTL_MS) {
      sessionStorage.removeItem(wizardKey(slug));
      return null;
    }
    return saved;
  } catch {
    return null;
  }
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
    selectedInsurance: null,
    patientMode: '',
    lookupCi: '',
    foundPatient: null,
    lookupDone: false,
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
      .then(([tenant, doctors]) => {
        // Restaurar progreso guardado (refresh a mitad del wizard): se
        // reconstruyen doctor/servicio desde el catálogo recién cargado.
        const saved = loadWizard(slug);
        const doctor = saved ? doctors.find((d) => d.id === saved.doctorId) : undefined;
        const service = doctor?.doctorServices.find((ds) => ds.service.id === saved?.serviceId);
        if (saved && doctor && service) {
          set({
            tenant,
            doctors,
            selectedDoctor: doctor,
            selectedService: service,
            selectedSlot: saved.selectedSlot,
            patientName: saved.patientName,
            patientCi: saved.patientCi,
            phone: saved.phone,
            appointmentId: saved.appointmentId,
            chosenMethod: saved.chosenMethod,
            selectedInsurance: saved.selectedInsurance,
            patientMode: saved.patientMode,
            foundPatient: saved.foundPatient,
            step: saved.step,
            loading: false,
          });
        } else {
          set({ tenant, doctors, loading: false });
        }
      })
      .catch(() =>
        set({ error: 'Error al cargar la clínica. Intenta más tarde.', loading: false }),
      );
  }, [slug]);

  // Guardar el progreso en cada cambio relevante (y limpiarlo al terminar).
  useEffect(() => {
    if (state.step === 'select-doctor' || !state.selectedDoctor || !state.selectedService) return;
    if (state.step === 'confirmed') {
      sessionStorage.removeItem(wizardKey(slug));
      return;
    }
    const saved: SavedWizard = {
      savedAt: Date.now(),
      step: state.step,
      doctorId: state.selectedDoctor.id,
      serviceId: state.selectedService.service.id,
      selectedSlot: state.selectedSlot,
      patientName: state.patientName,
      patientCi: state.patientCi,
      phone: state.phone,
      appointmentId: state.appointmentId,
      chosenMethod: state.chosenMethod,
      selectedInsurance: state.selectedInsurance,
      patientMode: state.patientMode,
      foundPatient: state.foundPatient,
    };
    try {
      sessionStorage.setItem(wizardKey(slug), JSON.stringify(saved));
    } catch {
      /* storage lleno/bloqueado: seguir sin persistencia */
    }
  }, [
    slug,
    state.step,
    state.selectedDoctor,
    state.selectedService,
    state.selectedSlot,
    state.patientName,
    state.patientCi,
    state.phone,
    state.appointmentId,
    state.chosenMethod,
    state.selectedInsurance,
    state.patientMode,
    state.foundPatient,
  ]);

  // ─── Disponibilidad al cambiar doctor/servicio ──────────────────────
  // Traemos 4 semanas de entrada (la lista usa 7 días; el calendario puede
  // navegar varias semanas sin recargar). Al navegar más allá, loadRange()
  // trae y fusiona el rango faltante.
  useEffect(() => {
    const { selectedDoctor, selectedService } = state;
    if (!selectedDoctor || !selectedService) return;

    // No borrar el slot elegido si ya pasamos del paso de horario (p.ej. al
    // restaurar el wizard tras un refresh en el paso de datos/pago).
    const pastSlotStep =
      state.step !== 'select-doctor' &&
      state.step !== 'select-service' &&
      state.step !== 'select-slot';
    set({
      loading: true,
      slots: [],
      availableDates: [],
      ...(pastSlotStep ? {} : { selectedSlot: null }),
    });

    // Ventana de reserva completa (hoy → +1 mes), igual que el clamp del
    // calendario: así "Siguiente" siempre tiene datos sin esperar el fetch.
    const from = new Date(todayStr() + 'T00:00:00').toISOString();
    const to = new Date(addDays(todayStr(), 31) + 'T23:59:59').toISOString();

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

  // Link secundario para que el paciente avise a la clínica de su reserva por
  // WhatsApp (número general del panel). Manual: él decide enviarlo. Solo se
  // muestra en flujos SIN QR (el flujo QR ya tiene el CTA del comprobante).
  const notifyWaLink =
    state.tenant?.whatsappContact && state.selectedSlot
      ? `https://wa.me/${state.tenant.whatsappContact.replace(/\D/g, '')}?text=${encodeURIComponent(
          `Nueva cita en ${state.tenant.name}: ${
            state.foundPatient?.firstName || state.patientName || 'Paciente'
          } · ${state.selectedService?.service.name ?? ''} con ${
            state.selectedDoctor?.name ?? ''
          } · ${formatDate(state.selectedSlot.startTime, tz)} a las ${formatTime(
            state.selectedSlot.startTime,
            tz,
          )}. Reservado desde simplecite.`,
        )}`
      : null;

  // Link a WhatsApp de la clínica (número general del panel) para que el
  // paciente envíe el comprobante del pago QR. La verificación es manual por
  // la clínica (no hay bot). Solo si el tenant configuró su WhatsApp.
  const clinicWaLink =
    state.tenant?.whatsappContact && state.selectedSlot
      ? `https://wa.me/${state.tenant.whatsappContact.replace(/\D/g, '')}?text=${encodeURIComponent(
          `Hola ${state.tenant.name}, reservé una cita${
            state.selectedDoctor ? ` con ${state.selectedDoctor.name}` : ''
          } para el ${formatDate(state.selectedSlot.startTime, tz)} a las ${formatTime(
            state.selectedSlot.startTime,
            tz,
          )} y realicé el pago por QR. Les envío el comprobante.`,
        )}`
      : null;

  // ─── Acciones ──────────────────────────────────────────────────────

  /**
   * Crea la reserva directamente (flujo abierto sin OTP) y pasa al paso de pago.
   * Paciente nuevo: viajan nombre/CI + teléfono. Regresante (lookup por CI):
   * viaja solo su patientId — no se piden datos de nuevo.
   */
  async function handleCreateBooking() {
    set({ loading: true });
    try {
      const booking = await createBooking(slug, {
        doctorId: state.selectedDoctor!.id,
        serviceId: state.selectedService!.service.id,
        startTime: state.selectedSlot!.startTime,
        ...(state.foundPatient
          ? { patientId: state.foundPatient.id }
          : {
              phone: state.phone,
              patient: {
                name: state.patientName,
                ci: state.patientCi || undefined,
              },
            }),
        turnstileToken: turnstileToken || undefined,
      });

      set({
        appointmentId: booking.appointmentId,
        // Doctor en modo seguro: el paso de pago se reemplaza por el de seguro.
        step: state.selectedDoctor?.doctorProfile?.insuranceMode
          ? 'select-insurance'
          : 'payment-method',
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
      await confirmBooking(
        slug,
        state.appointmentId,
        method,
        state.phone,
        undefined,
        state.foundPatient?.id,
      );
      set({ chosenMethod: method, step: 'confirmed', loading: false });
    } catch (e) {
      set({
        error: e instanceof ApiError ? e.message : 'No se pudo confirmar la cita',
        loading: false,
      });
    }
  }

  /** Confirma la cita cubierta por el seguro elegido (modo seguro, sin pago). */
  async function handleConfirmInsurance() {
    if (!state.selectedInsurance) return;
    set({ loading: true });
    try {
      await confirmBooking(
        slug,
        state.appointmentId,
        'INSURANCE',
        state.phone,
        state.selectedInsurance.id,
        state.foundPatient?.id,
      );
      set({ chosenMethod: 'INSURANCE', step: 'confirmed', loading: false });
    } catch (e) {
      set({
        error: e instanceof ApiError ? e.message : 'No se pudo confirmar la cita',
        loading: false,
      });
    }
  }

  /** Busca el historial del paciente regresante por CI (paso patient-lookup). */
  async function handleLookup() {
    if (!state.lookupCi.trim()) return;
    set({ loading: true, lookupDone: false, foundPatient: null });
    try {
      const res = await lookupPatient(slug, state.lookupCi);
      set({
        foundPatient:
          res.found && res.patientId ? { id: res.patientId, firstName: res.firstName ?? '' } : null,
        lookupDone: true,
        loading: false,
      });
    } catch (e) {
      set({
        error: e instanceof ApiError ? e.message : 'No se pudo buscar tu historial',
        loading: false,
      });
    }
  }

  // ─── Render ────────────────────────────────────────────────────────

  if (state.loading && state.step === 'select-doctor') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 min-h-[60vh] text-text-muted">
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
      {state.step !== 'select-doctor' && (
        <Stepper
          step={state.step}
          primary={primary}
          insurance={!!state.selectedDoctor?.doctorProfile?.insuranceMode}
          returning={state.patientMode === 'returning'}
        />
      )}

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
                <h1 className="text-3xl font-bold text-text-primary">
                  Reserva tu cita{state.tenant ? ` en ${state.tenant.name}` : ''}
                </h1>
                <p className="mx-auto max-w-md text-text-muted">
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
                      className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                    >
                      <DoctorAvatar
                        name={doc.name}
                        photoUrl={doc.doctorProfile?.photoUrl ?? null}
                        color={primary}
                        // Pocos doctores (≤3): avatar más grande, la cara importa.
                        large={state.doctors.length <= 3}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-text-primary">{doc.name}</p>
                        {doc.doctorProfile?.specialty && (
                          <p className="truncate text-sm text-text-muted">
                            {doc.doctorProfile.specialty}
                          </p>
                        )}
                        {doc.doctorServices.length > 0 && (
                          <p className="mt-0.5 text-xs text-text-muted">
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
                    className="w-full text-left bg-surface border border-border rounded-xl p-4 hover:border-primary hover:shadow-sm transition"
                  >
                    <p className="font-semibold text-text-primary">{ds.service.name}</p>
                    {ds.service.description && (
                      <p className="text-sm text-text-muted mt-1">{ds.service.description}</p>
                    )}
                    <p className="text-sm text-text-muted mt-1">
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
              <div className="mb-4 flex w-fit gap-1 rounded-lg bg-muted p-1">
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
                        ? 'bg-surface text-text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-secondary'
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
                    if (slot) set({ selectedSlot: slot, step: 'patient-type' });
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
                                ? 'cursor-not-allowed border-border bg-canvas text-text-disabled opacity-60'
                                : 'bg-surface border-border text-text-secondary hover:border-primary'
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
                    <p className="mb-3 text-sm text-text-muted">
                      <span className="font-medium text-text-secondary">
                        {state.selectedService.service.name}
                      </span>{' '}
                      ·{' '}
                      {state.selectedService.customDuration ??
                        state.selectedService.service.duration}{' '}
                      min · horarios en la zona de la clínica
                    </p>
                  )}
                  {state.loading ? (
                    <p className="text-text-muted text-center py-6 animate-pulse">
                      Buscando horarios...
                    </p>
                  ) : daySlots.length === 0 ? (
                    <p className="text-text-muted text-center py-6">
                      No hay turnos disponibles este día. Elige otro.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {daySlots.map((slot) => (
                        <motion.button
                          key={slot.startTime}
                          disabled={!slot.available}
                          onClick={() => set({ selectedSlot: slot, step: 'patient-type' })}
                          // Cupos disponibles: feedback de pulsación con resorte.
                          // Ocupados: inertes (sin hover ni tap) para no malgastar toques.
                          whileTap={!slot.available || reduce ? undefined : { scale: 0.94 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          className={`min-h-11 rounded-xl px-1 py-2 text-[13px] font-medium border transition ${
                            !slot.available
                              ? 'cursor-not-allowed border-border bg-muted text-text-disabled opacity-60'
                              : 'bg-surface border-border text-text-primary hover:border-primary hover:shadow-sm'
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

          {/* ── Paso 4: ¿Paciente nuevo o regresante? ── */}
          {state.step === 'patient-type' && state.selectedSlot && (
            <StepCard
              title={`¿Ya visitaste ${state.tenant?.name ?? 'la clínica'} antes?`}
              onBack={() => set({ step: 'select-slot' })}
            >
              <div className="bg-accent rounded-xl p-3 mb-5 text-sm font-medium text-accent-foreground">
                {slotSummary(state.selectedSlot.startTime, state.selectedSlot.endTime, tz)}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  onClick={() =>
                    set({ patientMode: 'new', foundPatient: null, step: 'patient-info' })
                  }
                  className="flex min-h-20 items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition-all hover:border-primary hover:shadow-sm active:scale-[.99]"
                >
                  <span className="text-2xl" aria-hidden>
                    👋
                  </span>
                  <div>
                    <p className="font-semibold text-text-primary">Soy paciente nuevo</p>
                    <p className="text-sm text-text-muted">Es mi primera vez aquí.</p>
                  </div>
                </button>
                <button
                  onClick={() =>
                    set({
                      patientMode: 'returning',
                      lookupCi: '',
                      foundPatient: null,
                      lookupDone: false,
                      step: 'patient-lookup',
                    })
                  }
                  className="flex min-h-20 items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition-all hover:border-primary hover:shadow-sm active:scale-[.99]"
                >
                  <span className="text-2xl" aria-hidden>
                    🗂️
                  </span>
                  <div>
                    <p className="font-semibold text-text-primary">Ya he venido antes</p>
                    <p className="text-sm text-text-muted">Buscar mi historial con mi CI.</p>
                  </div>
                </button>
              </div>
            </StepCard>
          )}

          {/* ── Paso 4b (regresante): buscar historial por CI ── */}
          {state.step === 'patient-lookup' && state.selectedSlot && (
            <StepCard
              title="Ingresa tu cédula de identidad"
              onBack={() => set({ step: 'patient-type' })}
            >
              <p className="mb-4 text-sm text-text-muted">
                Buscaremos tu historial en {state.tenant?.name ?? 'la clínica'}.
              </p>
              <div className="space-y-4">
                <Field
                  label="Cédula de identidad"
                  value={state.lookupCi}
                  onChange={(v) => set({ lookupCi: v, lookupDone: false, foundPatient: null })}
                  placeholder="Ej: 1234567"
                  inputMode="numeric"
                  maxLength={20}
                  required
                />

                {state.foundPatient ? (
                  <>
                    <div className="rounded-xl border border-border bg-accent p-4 text-sm text-accent-foreground">
                      👋 Hola, <span className="font-semibold">{state.foundPatient.firstName}</span>
                      . Encontramos tu historial.
                    </div>
                    <TurnstileWidget onToken={setTurnstileToken} />
                    <Btn
                      label="Confirmar y continuar"
                      color={primary}
                      loading={state.loading}
                      disabled={false}
                      onClick={handleCreateBooking}
                    />
                  </>
                ) : state.lookupDone ? (
                  <>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      No encontramos ese CI en {state.tenant?.name ?? 'la clínica'}.
                    </div>
                    <Btn
                      label="Registrarme como paciente nuevo"
                      color={primary}
                      loading={false}
                      disabled={false}
                      onClick={() =>
                        set({ patientMode: 'new', foundPatient: null, step: 'patient-info' })
                      }
                    />
                  </>
                ) : (
                  <Btn
                    label="Buscar mi historial"
                    color={primary}
                    loading={state.loading}
                    disabled={!state.lookupCi.trim()}
                    onClick={handleLookup}
                  />
                )}
              </div>
            </StepCard>
          )}

          {/* ── Paso 4 (nuevo): Datos del paciente + teléfono ── */}
          {state.step === 'patient-info' && state.selectedSlot && (
            <StepCard title="Tus datos" onBack={() => set({ step: 'patient-type' })}>
              <div className="bg-accent rounded-xl p-3 mb-5 text-sm font-medium text-accent-foreground">
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
                <div className="space-y-1">
                  <label className="text-sm font-medium text-text-secondary">
                    Número de teléfono<span className="ml-1 text-red-500">*</span>
                  </label>
                  <PhoneField value={state.phone} onChange={(v) => set({ phone: v })} />
                </div>
                <p className="text-xs text-text-muted">
                  Lo usaremos para coordinar tu cita. No se comparte con terceros.
                </p>

                <TurnstileWidget onToken={setTurnstileToken} />

                <Btn
                  label={
                    state.selectedDoctor?.doctorProfile?.insuranceMode
                      ? 'Continuar'
                      : 'Continuar al pago'
                  }
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
              <div className="bg-accent rounded-xl p-3 mb-5 text-sm text-accent-foreground">
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
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition-all hover:border-primary hover:shadow-sm active:scale-[.99] disabled:opacity-50"
                >
                  <span className="text-2xl">💵</span>
                  <div>
                    <p className="font-semibold text-text-primary">Efectivo (en la clínica)</p>
                    <p className="text-sm text-text-muted">Reserva tu cita y paga al llegar.</p>
                  </div>
                </button>

                <button
                  onClick={() => handleConfirm('STATIC_QR')}
                  disabled={state.loading}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition-all hover:border-primary hover:shadow-sm active:scale-[.99] disabled:opacity-50"
                >
                  <span className="text-2xl">📲</span>
                  <div>
                    <p className="font-semibold text-text-primary">QR bancario</p>
                    <p className="text-sm text-text-muted">
                      {qrBanks.length > 0
                        ? 'Escanea el QR con tu banco y paga al instante.'
                        : 'Coordina el pago por QR con la clínica.'}
                    </p>
                  </div>
                </button>
              </div>

              {state.loading && (
                <p className="mt-3 text-center text-sm text-text-muted">Procesando…</p>
              )}
            </StepCard>
          )}

          {/* ── Paso 5 (modo seguro): Elegir cobertura ── */}
          {state.step === 'select-insurance' && state.selectedSlot && (
            <StepCard title="Tu cobertura de seguro">
              <div className="bg-accent rounded-xl p-3 mb-5 text-sm text-accent-foreground">
                <span className="font-medium">{state.selectedDoctor?.name}</span>
                <br />
                <span className="font-medium">
                  {slotSummary(state.selectedSlot.startTime, state.selectedSlot.endTime, tz)}
                </span>
              </div>

              <p className="mb-4 text-sm text-text-muted">
                Esta consulta está cubierta por seguro médico. ¿Con qué seguro asistirás?
              </p>

              {(state.selectedDoctor?.insurances?.length ?? 0) === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
                  Este especialista no tiene seguros configurados. Contacta a la clínica.
                </div>
              ) : (
                <div className="space-y-3">
                  {state.selectedDoctor!.insurances!.map((ins) => {
                    const active = state.selectedInsurance?.id === ins.id;
                    return (
                      <button
                        key={ins.id}
                        onClick={() => set({ selectedInsurance: ins })}
                        aria-pressed={active}
                        className={`flex min-h-20 w-full items-center gap-3 rounded-2xl border bg-surface p-4 text-left transition-all active:scale-[.99] ${
                          active
                            ? 'border-primary shadow-sm ring-2 ring-primary/25'
                            : 'border-border hover:border-primary hover:shadow-sm'
                        }`}
                      >
                        <span
                          className="flex size-10 flex-shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: `${primary}1a`, color: primary }}
                          aria-hidden
                        >
                          <svg viewBox="0 0 24 24" className="size-5" fill="none">
                            <path
                              d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <div>
                          <p className="font-semibold text-text-primary">{ins.name}</p>
                          <p className="text-sm text-text-muted">Sin costo para ti</p>
                        </div>
                      </button>
                    );
                  })}

                  <Btn
                    label="Confirmar cita"
                    color={primary}
                    loading={state.loading}
                    disabled={!state.selectedInsurance}
                    onClick={handleConfirmInsurance}
                  />
                </div>
              )}
            </StepCard>
          )}

          {/* ── Paso 7: Confirmado ── */}
          {state.step === 'confirmed' && state.selectedSlot && (
            <StepCard title="">
              <div className="text-center space-y-4 py-4">
                <CheckDraw color={primary} reduce={!!reduce} />
                <h2 className="text-2xl font-bold text-text-primary">
                  {state.chosenMethod === 'STATIC_QR' ? '¡Cita registrada!' : '¡Cita confirmada!'}
                </h2>
                <p className="text-text-secondary">
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
                      <p className="text-sm text-text-muted">
                        Escanea el QR con la app de tu banco y realiza el pago. Luego{' '}
                        <span className="font-semibold">envíanos el comprobante por WhatsApp</span>{' '}
                        y la clínica confirmará tu cita.
                      </p>
                      {clinicWaLink && <WhatsAppSendButton href={clinicWaLink} />}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
                        Tu cita quedó registrada. Realiza el pago y{' '}
                        <span className="font-semibold">envíanos el comprobante por WhatsApp</span>{' '}
                        para confirmar tu cita.
                      </div>
                      {clinicWaLink && <WhatsAppSendButton href={clinicWaLink} />}
                    </div>
                  )
                ) : state.chosenMethod === 'INSURANCE' ? (
                  <p className="text-sm text-text-muted">
                    Tu cita está confirmada y cubierta por{' '}
                    <span className="font-semibold text-text-secondary">
                      {state.selectedInsurance?.name ?? 'tu seguro médico'}
                    </span>
                    . No necesitas pagar nada; solo trae tu credencial del seguro.
                  </p>
                ) : (
                  <p className="text-sm text-text-muted">
                    💵 Tu cita quedó registrada. Paga en efectivo en la clínica el día de tu cita.
                  </p>
                )}

                {/* Aviso manual a la clínica (flujos sin QR; el QR ya tiene su CTA) */}
                {state.chosenMethod !== 'STATIC_QR' && notifyWaLink && (
                  <a
                    href={notifyWaLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-sm font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary"
                  >
                    📲 Notificar a {state.tenant?.name} por WhatsApp →
                  </a>
                )}

                {/* Ubicación de la clínica: referencia física para llegar. */}
                {state.tenant?.address && (
                  <div className="rounded-2xl border border-border bg-surface p-4 text-left">
                    <p className="mb-3 text-sm text-text-muted">
                      Por si lo necesitas, aquí está la ubicación de {state.tenant.name}.
                    </p>
                    {state.tenant.locationPhotoUrl && (
                      <div className="relative mb-3 h-44 w-full overflow-hidden rounded-xl border border-border">
                        <Image
                          src={state.tenant.locationPhotoUrl}
                          alt={`Fachada de ${state.tenant.name}`}
                          fill
                          sizes="(max-width: 640px) 100vw, 560px"
                          className="object-cover"
                        />
                      </div>
                    )}
                    <p className="text-sm font-medium text-text-secondary">
                      {state.tenant.address}
                    </p>
                    <a
                      href={
                        state.tenant.mapsUrl ||
                        `https://maps.google.com/?q=${encodeURIComponent(state.tenant.address)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition hover:border-primary hover:text-text-primary"
                    >
                      Abrir en Google Maps →
                    </a>
                  </div>
                )}

                <button
                  className="mt-4 text-sm underline text-text-muted"
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

/** CTA para enviar el comprobante al WhatsApp general de la clínica. */
function WhatsAppSendButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-whatsapp px-4 py-3 font-semibold text-white transition hover:bg-[var(--whatsapp-hover)] active:scale-[.99]"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
        <path d="M17.5 14.4c-.3-.15-1.8-.9-2.08-1-.28-.1-.48-.15-.68.15-.2.3-.78 1-.96 1.2-.18.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.68-2.08-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.68-1.64-.93-2.24-.24-.58-.5-.5-.68-.51h-.58c-.2 0-.53.08-.8.38-.28.3-1.05 1.03-1.05 2.5 0 1.48 1.08 2.9 1.23 3.1.15.2 2.12 3.24 5.14 4.54.72.3 1.28.48 1.72.62.72.23 1.38.2 1.9.12.58-.08 1.8-.73 2.05-1.44.25-.7.25-1.3.18-1.44-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.6 15.06L2 22l5.06-1.33A10 10 0 1 0 12 2z" />
      </svg>
      Enviar comprobante por WhatsApp
    </a>
  );
}

function Stepper({
  step,
  primary,
  insurance,
  returning,
}: {
  step: Step;
  primary: string;
  /** Doctor en modo seguro: el paso de pago se reemplaza por el de seguro. */
  insurance: boolean;
  /** Paciente regresante: la posición "Datos" se llama "Tu CI". */
  returning: boolean;
}) {
  // El stepper se construye dinámicamente según el modo del doctor elegido y
  // el tipo de paciente; si el paciente vuelve atrás, se recalcula solo.
  // "Datos" y "Tu CI" comparten posición: el label cambia según la elección.
  const STEPS: Step[] = [
    'select-doctor',
    'select-service',
    'select-slot',
    'patient-type',
    returning ? 'patient-lookup' : 'patient-info',
    insurance ? 'select-insurance' : 'payment-method',
    'confirmed',
  ];
  const labels = [
    'Doctor',
    'Servicio',
    'Horario',
    '¿Eres nuevo?',
    returning ? 'Tu CI' : 'Datos',
    insurance ? 'Seguro' : 'Pago',
    '¡Listo!',
  ];
  const idx = STEPS.indexOf(step);
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
            className={`text-xs hidden sm:block ${i <= idx ? 'text-text-primary font-medium' : 'text-text-muted'}`}
          >
            {labels[i]}
          </span>
          {i < STEPS.length - 1 && <div className="w-4 h-px bg-muted flex-shrink-0" />}
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
    <div className="bg-surface rounded-2xl shadow-sm border border-border p-6 space-y-5">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-lg text-text-muted transition-colors hover:bg-muted hover:text-text-primary active:scale-95"
            aria-label="Volver"
          >
            ←
          </button>
        )}
        {title && <h2 className="text-lg font-semibold text-text-primary">{title}</h2>}
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

/**
 * Avatar del especialista: foto (next/image) si existe, iniciales si no o si
 * la imagen falla. 48px en listas largas, 64px cuando hay ≤3 doctores.
 */
function DoctorAvatar({
  name,
  photoUrl,
  color,
  large,
}: {
  name: string;
  photoUrl: string | null;
  color: string;
  large: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  if (!photoUrl || imgError) return <Avatar name={name} color={color} />;
  return (
    <div
      className={`relative flex-shrink-0 overflow-hidden rounded-full border border-border ${
        large ? 'size-16' : 'size-12'
      }`}
    >
      <Image
        src={photoUrl}
        alt={name}
        fill
        sizes={large ? '64px' : '48px'}
        className="object-cover"
        onError={() => setImgError(true)}
      />
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
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">
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
        className="w-full border border-border-strong rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
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
