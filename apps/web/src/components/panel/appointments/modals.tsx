'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  createAppointment,
  createPatient,
  getPatients,
  getDoctorsAdmin,
  getDoctorServices,
  getSlots,
  getDoctorInsurances,
  PanelApiError,
  type AppointmentListItem,
  type PatientListItem,
  type Doctor,
  type DoctorServiceLink,
  type PaymentMethod,
  type PanelSlot,
  type DoctorInsuranceOption,
} from '@/lib/panel-api';
import { Spinner } from '@/components/panel/ui';
import { Button } from '@/components/ui/button';
import { PhoneField } from '@/components/PhoneField';
import {
  X,
  Banknote,
  QrCode,
  ShieldCheck,
  Repeat,
  CalendarCheck,
  CalendarX2,
  Search,
} from 'lucide-react';

/** Días de la semana con el índice de Date.getDay() (0 = domingo). */
const WEEKDAYS = [
  { value: 1, short: 'L', name: 'lunes' },
  { value: 2, short: 'M', name: 'martes' },
  { value: 3, short: 'X', name: 'miércoles' },
  { value: 4, short: 'J', name: 'jueves' },
  { value: 5, short: 'V', name: 'viernes' },
  { value: 6, short: 'S', name: 'sábado' },
  { value: 0, short: 'D', name: 'domingo' },
];

/** Resultado de crear un tratamiento (lo devuelve el API). */
interface SeriesResult {
  id: string;
  created: number;
  skipped: { startTime: string; reason: string }[];
}

// ─── A11y helper para modales ─────────────────────────────────────────
// Escape cierra, foco entra al diálogo al abrir y se restaura al cerrar.
// Corre una sola vez en el montaje; usa un ref para leer el onClose vigente.

function useDialogA11y(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    ref.current
      ?.querySelector<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
      )
      ?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return ref;
}

// ─── Receipt modal ─────────────────────────────────────────────────────

export function ReceiptModal({
  appt,
  onClose,
  onApprove,
}: {
  appt: AppointmentListItem;
  onClose: () => void;
  onApprove: () => Promise<void>;
}) {
  const [approving, setApproving] = useState(false);
  const dialogRef = useDialogA11y(onClose);

  const handleApprove = async () => {
    setApproving(true);
    await onApprove();
    setApproving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(2,6,23,0.4)] p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Comprobante de pago de ${appt.patient.name}`}
        className="bg-surface-raised rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-modal max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-semibold text-text-primary">Comprobante de pago</p>
            <p className="text-sm text-text-muted">{appt.patient.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="size-5" />
          </Button>
        </div>
        <div className="p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={appt.receiptUrl!}
            alt="Comprobante de pago"
            className="mx-auto w-full rounded-xl border border-border bg-canvas object-contain max-h-[70vh]"
          />
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <Button variant="outline" className="flex-1 h-11" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            className="flex-1 h-11 bg-[var(--success)] hover:bg-[#0ea371] text-white"
            disabled={approving}
            onClick={handleApprove}
          >
            {approving ? 'Aprobando…' : 'Aprobar Pago'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Nueva Cita modal ─────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/** Hora local HH:mm de un slot (los slots vienen en ISO/UTC). */
function fmtSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function NewAppointmentModal({
  token,
  slug,
  initialStart,
  lockedDoctor,
  onClose,
  onCreated,
}: {
  token: string;
  slug: string;
  initialStart?: Date;
  /** Rol DOCTOR: solo agenda en su propia agenda (el backend también lo exige). */
  lockedDoctor?: { id: string; name: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<DoctorServiceLink[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);

  const [patientId, setPatientId] = useState('');
  const [patientMode, setPatientMode] = useState<'existing' | 'new'>('existing');
  const [patientQuery, setPatientQuery] = useState('');
  const [newPatient, setNewPatient] = useState({ name: '', phone: '', ci: '' });
  const [doctorId, setDoctorId] = useState(lockedDoctor?.id ?? '');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(initialStart ? toDateInput(initialStart) : '');
  const [slots, setSlots] = useState<PanelSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  // Inicio (ISO) del slot elegido; se selecciona desde los chips de horario.
  const [selectedStart, setSelectedStart] = useState(
    initialStart ? initialStart.toISOString() : '',
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  // Modo seguro (doctor con insuranceMode): seguros asignados + el elegido.
  const [insurances, setInsurances] = useState<DoctorInsuranceOption[]>([]);
  const [insuranceId, setInsuranceId] = useState('');
  const [saving, setSaving] = useState(false);
  // Tratamiento: repetir la cita en varios días (ej. 10 sesiones lun/mié/vie).
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [endMode, setEndMode] = useState<'count' | 'until'>('count');
  const [count, setCount] = useState(10);
  const [until, setUntil] = useState('');
  // Resultado de la serie cuando hubo fechas omitidas (se muestra en modal).
  const [seriesResult, setSeriesResult] = useState<SeriesResult | null>(null);
  const dialogRef = useDialogA11y(onClose);

  // Al activar "repetir", se marca el día de la fecha elegida: es el patrón
  // más probable y evita que el usuario tenga que deducirlo.
  useEffect(() => {
    if (repeat && weekdays.length === 0 && selectedStart) {
      setWeekdays([new Date(selectedStart).getDay()]);
    }
  }, [repeat, weekdays.length, selectedStart]);

  useEffect(() => {
    Promise.all([getPatients(token, slug, { limit: 100 }), getDoctorsAdmin(token, slug)])
      .then(([p, d]) => {
        setPatients(p.items);
        setDoctors(d.filter((doc) => doc.isActive));
      })
      .catch(() => {})
      .finally(() => setLoadingInit(false));
  }, [token, slug]);

  useEffect(() => {
    if (!doctorId) {
      setServices([]);
      setServiceId('');
      return;
    }
    getDoctorServices(token, slug, doctorId)
      .then((s) => {
        setServices(s);
        setServiceId('');
      })
      .catch(() => setServices([]));
  }, [doctorId, token, slug]);

  const selectedPatient = patients.find((p) => p.id === patientId);
  // Filtrado en cliente: los pacientes ya vienen cargados en el modal, así que
  // buscar no dispara peticiones ni espera.
  const filteredPatients = (() => {
    const q = patientQuery.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      [p.name, p.phone ?? '', p.ci ?? ''].some((f) => f.toLowerCase().includes(q)),
    );
  })();

  const selectedDoctor = doctors.find((d) => d.id === doctorId);
  const insuranceMode = selectedDoctor?.insuranceMode ?? false;

  // Doctor en modo seguro: cargar sus seguros asignados (reemplazan al pago).
  useEffect(() => {
    setInsuranceId('');
    if (!doctorId || !insuranceMode) {
      setInsurances([]);
      return;
    }
    getDoctorInsurances(token, slug, doctorId)
      .then((opts) => setInsurances(opts.filter((o) => o.assigned)))
      .catch(() => setInsurances([]));
  }, [doctorId, insuranceMode, token, slug]);

  // Disponibilidad del día elegido (mismo motor que el Web Booking): con doctor +
  // servicio + fecha, trae los horarios reales del especialista y descarta los
  // ocupados. Reemplaza el <input type="time"> libre que dejaba elegir cualquier
  // hora fuera de agenda.
  useEffect(() => {
    if (!doctorId || !serviceId || !date) {
      setSlots([]);
      return;
    }
    const from = new Date(`${date}T00:00:00`).toISOString();
    const to = new Date(`${date}T23:59:59`).toISOString();
    setLoadingSlots(true);
    getSlots(token, slug, { doctorId, serviceId, from, to })
      .then((s) => {
        setSlots(s);
        // Conserva la selección solo si sigue siendo un slot disponible.
        setSelectedStart((cur) =>
          s.some((sl) => sl.available && sl.startTime === cur) ? cur : '',
        );
      })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [doctorId, serviceId, date, token, slug]);

  const selectedService = services.find((s) => s.serviceId === serviceId);
  const durationMin = selectedService?.customDuration ?? selectedService?.service.duration ?? 30;
  const availableSlots = slots.filter((s) => s.available);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorId || !serviceId || !selectedStart) {
      toast.error('Completa todos los campos y elige un horario');
      return;
    }
    if (patientMode === 'existing' && !patientId) {
      toast.error('Selecciona un paciente');
      return;
    }
    // Identidad: basta teléfono O CI. Los pacientes mayores suelen llegar sin
    // celular propio y se los registra por cédula.
    if (patientMode === 'new' && !newPatient.name.trim()) {
      toast.error('El nombre del nuevo paciente es obligatorio');
      return;
    }
    if (patientMode === 'new' && !newPatient.phone.trim() && !newPatient.ci.trim()) {
      toast.error('Registra al menos un teléfono o una cédula (CI)');
      return;
    }
    if (insuranceMode && !insuranceId) {
      toast.error('Selecciona el seguro que cubre la cita');
      return;
    }
    // El slot ya viene recortado a la duración del servicio; endTime del backend.
    const slot = slots.find((s) => s.startTime === selectedStart);
    const startTime = selectedStart;
    const endTime =
      slot?.endTime ??
      new Date(new Date(selectedStart).getTime() + durationMin * 60_000).toISOString();
    setSaving(true);
    try {
      // Walk-in: registra el paciente primero (dedup por phone/ci en el backend).
      let pid = patientId;
      if (patientMode === 'new') {
        const created = await createPatient(token, slug, {
          name: newPatient.name.trim(),
          phone: newPatient.phone.trim() || undefined,
          ci: newPatient.ci.trim() || undefined,
        });
        pid = created.id;
      }
      const created = await createAppointment(token, slug, {
        patientId: pid,
        doctorId,
        serviceId,
        startTime,
        endTime,
        // Modo seguro: se confirma directo con el seguro elegido (sin cobro).
        paymentMethod: insuranceMode ? 'INSURANCE' : paymentMethod,
        ...(insuranceMode && { tenantInsuranceId: insuranceId }),
        ...(repeat && weekdays.length > 0
          ? {
              recurrence: {
                weekdays,
                ...(endMode === 'count' ? { count } : { until: `${until}T23:59:59.000Z` }),
              },
            }
          : {}),
      });

      // Salió todo: un toast basta. Hubo omisiones: modal, porque el usuario
      // necesita ver QUÉ fechas quedaron fuera para reagendarlas.
      if (created.series && created.series.skipped.length > 0) {
        setSeriesResult(created.series);
        setSaving(false);
        return;
      }
      toast.success(
        created.series ? `Tratamiento creado: ${created.series.created} sesiones.` : 'Cita creada.',
      );
      onCreated();
    } catch (err) {
      toast.error(err instanceof PanelApiError ? err.message : 'Error al crear cita');
      setSaving(false);
    }
  };

  // Tratamiento con fechas omitidas: se muestra el resumen en vez del
  // formulario. Es información que el usuario debe leer (qué quedó sin
  // agendar), no un aviso que se desvanece solo.
  if (seriesResult) {
    return <SeriesResultModal result={seriesResult} onClose={onCreated} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(2,6,23,0.4)] p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Nueva cita"
        className="bg-surface-raised rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-modal max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface-raised">
          <p className="font-semibold text-text-primary">Nueva Cita</p>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="size-5" />
          </Button>
        </div>

        {loadingInit ? (
          <div className="py-10">
            <Spinner />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="block">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">Paciente</span>
                {/* Toggle Existente / Nuevo (walk-in) */}
                <div className="flex gap-1 rounded-md border border-border bg-surface p-[3px] text-xs">
                  {(
                    [
                      ['existing', 'Existente'],
                      ['new', 'Nuevo'],
                    ] as ['existing' | 'new', string][]
                  ).map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPatientMode(k)}
                      aria-pressed={patientMode === k}
                      className={`rounded-[6px] px-2.5 py-1 font-medium transition-colors ${
                        patientMode === k
                          ? 'bg-primary text-white'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {patientMode === 'existing' ? (
                /* Buscador en vez de un <select>: con cientos de pacientes la
                   lista desplegable es inservible, y el nombre casi nunca se
                   recuerda completo (se busca por apellido, teléfono o CI). */
                <div className="mt-1">
                  {selectedPatient ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-primary bg-accent px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {selectedPatient.name}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {selectedPatient.phone ?? selectedPatient.ci ?? 'sin contacto'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPatientId('');
                          setPatientQuery('');
                        }}
                        className="shrink-0 text-sm font-medium text-text-secondary hover:text-text-primary"
                      >
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
                        <input
                          type="search"
                          value={patientQuery}
                          onChange={(e) => setPatientQuery(e.target.value)}
                          placeholder="Buscar por nombre, teléfono o CI…"
                          aria-label="Buscar paciente"
                          className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <ul className="mt-2 max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                        {filteredPatients.length === 0 ? (
                          <li className="px-3 py-3 text-center text-xs text-text-muted">
                            {patientQuery
                              ? 'Ningún paciente coincide. Usa "Nuevo" para registrarlo.'
                              : 'Aún no hay pacientes registrados.'}
                          </li>
                        ) : (
                          filteredPatients.slice(0, 20).map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => setPatientId(p.id)}
                                className="w-full px-3 py-2 text-left transition hover:bg-canvas"
                              >
                                <span className="block truncate text-sm text-text-primary">
                                  {p.name}
                                </span>
                                <span className="block truncate text-xs text-text-muted">
                                  {p.phone ?? p.ci ?? 'sin contacto'}
                                </span>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-1 space-y-2 rounded-lg border border-border bg-canvas p-3">
                  <input
                    value={newPatient.name}
                    onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                    placeholder="Nombre completo"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <PhoneField
                    value={newPatient.phone}
                    onChange={(v) => setNewPatient({ ...newPatient, phone: v })}
                  />
                  <input
                    value={newPatient.ci}
                    onChange={(e) => setNewPatient({ ...newPatient, ci: e.target.value })}
                    placeholder="CI"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-text-muted">
                    Con el teléfono o la cédula basta. Si alguno ya existe, se usará ese paciente
                    (no se duplica).
                  </p>
                </div>
              )}
            </div>

            <label className="block">
              <span className="text-sm font-medium text-text-secondary">Doctor</span>
              {lockedDoctor ? (
                // El doctor agenda solo en su propia agenda: sin selector.
                <p className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text-primary">
                  {lockedDoctor.name}
                </p>
              ) : (
                <select
                  value={doctorId}
                  onChange={(e) => setDoctorId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Seleccionar doctor…</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-text-secondary">Servicio</span>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                required
                disabled={!doctorId || services.length === 0}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-canvas disabled:text-text-muted"
              >
                <option value="">
                  {doctorId ? 'Seleccionar servicio…' : 'Selecciona un doctor primero'}
                </option>
                {services.map((s) => (
                  <option key={s.serviceId} value={s.serviceId}>
                    {s.service.name} — Bs {s.customPrice ?? s.service.price} ·{' '}
                    {s.customDuration ?? s.service.duration} min
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-text-secondary">Fecha</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  min={new Date().toISOString().slice(0, 10)}
                  disabled={!serviceId}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-canvas disabled:text-text-muted"
                />
              </label>

              <div className="block">
                <span className="text-sm font-medium text-text-secondary">Horario disponible</span>
                {!serviceId ? (
                  <p className="mt-1 text-xs text-text-muted">Elige doctor y servicio primero.</p>
                ) : !date ? (
                  <p className="mt-1 text-xs text-text-muted">
                    Elige una fecha para ver los horarios del especialista.
                  </p>
                ) : loadingSlots ? (
                  <div className="mt-2 py-2">
                    <Spinner />
                  </div>
                ) : availableSlots.length === 0 ? (
                  <p className="mt-1 text-xs text-text-muted">
                    No hay horarios disponibles ese día. Prueba con otra fecha.
                  </p>
                ) : (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {availableSlots.map((s) => {
                      const active = s.startTime === selectedStart;
                      return (
                        <button
                          key={s.startTime}
                          type="button"
                          onClick={() => setSelectedStart(s.startTime)}
                          aria-pressed={active}
                          className={`rounded-lg border px-2 py-2 text-sm font-medium tabular-nums transition ${
                            active
                              ? 'border-primary bg-primary text-white'
                              : 'border-border text-text-secondary hover:border-border-strong'
                          }`}
                        >
                          {fmtSlotTime(s.startTime)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {insuranceMode ? (
              /* Doctor en modo seguro: el seguro reemplaza al método de pago. */
              <fieldset>
                <legend className="text-sm font-medium text-text-secondary mb-2">
                  Seguro que cubre la cita
                </legend>
                {insurances.length === 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Este especialista no tiene seguros asignados. Asígnaselos en{' '}
                    <strong>Doctores</strong>.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {insurances.map((ins) => (
                      <label
                        key={ins.id}
                        className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition ${insuranceId === ins.id ? 'border-primary bg-accent' : 'border-border hover:border-border-strong'}`}
                      >
                        <input
                          type="radio"
                          name="insurance"
                          value={ins.id}
                          checked={insuranceId === ins.id}
                          onChange={() => setInsuranceId(ins.id)}
                          className="accent-brand-600"
                        />
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <ShieldCheck className="size-4 text-text-muted" /> {ins.name}
                        </span>
                      </label>
                    ))}
                    <p className="text-xs text-text-muted">
                      La cita se confirma directo: el paciente no paga en la clínica.
                    </p>
                  </div>
                )}
              </fieldset>
            ) : (
              <fieldset>
                <legend className="text-sm font-medium text-text-secondary mb-2">
                  Método de pago
                </legend>
                <div className="flex gap-3">
                  {(['CASH', 'STATIC_QR'] as PaymentMethod[]).map((pm) => (
                    <label
                      key={pm}
                      className={`flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition ${paymentMethod === pm ? 'border-primary bg-accent' : 'border-border hover:border-border-strong'}`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={pm}
                        checked={paymentMethod === pm}
                        onChange={() => setPaymentMethod(pm)}
                        className="accent-brand-600"
                      />
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        {pm === 'CASH' ? (
                          <>
                            <Banknote className="size-4 text-text-muted" /> Efectivo
                          </>
                        ) : (
                          <>
                            <QrCode className="size-4 text-text-muted" /> QR bancario
                          </>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {/* Tratamiento: repetir la cita en varios días. Plegado por
                defecto — la mayoría de las citas son sueltas y no debe
                estorbar el flujo normal. */}
            <div className="rounded-xl border border-border p-3">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                  className="size-4 accent-brand-600"
                />
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                  <Repeat className="size-4 text-text-muted" /> Repetir esta cita (tratamiento)
                </span>
              </label>

              {repeat && (
                <div className="mt-3 space-y-3 border-t border-border pt-3">
                  <div>
                    <span className="text-sm font-medium text-text-secondary">Días</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {WEEKDAYS.map((d) => {
                        const active = weekdays.includes(d.value);
                        return (
                          <button
                            key={d.value}
                            type="button"
                            aria-pressed={active}
                            aria-label={d.name}
                            onClick={() =>
                              setWeekdays((prev) =>
                                prev.includes(d.value)
                                  ? prev.filter((x) => x !== d.value)
                                  : [...prev, d.value],
                              )
                            }
                            className={`size-9 rounded-full border text-sm font-medium transition ${
                              active
                                ? 'border-primary bg-primary text-white'
                                : 'border-border text-text-secondary hover:border-border-strong'
                            }`}
                          >
                            {d.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <span className="text-sm font-medium text-text-secondary">Hasta cuándo</span>
                    <div className="mt-1.5 flex gap-2">
                      <button
                        type="button"
                        aria-pressed={endMode === 'count'}
                        onClick={() => setEndMode('count')}
                        className={`rounded-lg border px-3 py-2 text-sm transition ${
                          endMode === 'count'
                            ? 'border-primary bg-accent text-accent-foreground'
                            : 'border-border text-text-secondary hover:border-border-strong'
                        }`}
                      >
                        Nº de sesiones
                      </button>
                      <button
                        type="button"
                        aria-pressed={endMode === 'until'}
                        onClick={() => setEndMode('until')}
                        className={`rounded-lg border px-3 py-2 text-sm transition ${
                          endMode === 'until'
                            ? 'border-primary bg-accent text-accent-foreground'
                            : 'border-border text-text-secondary hover:border-border-strong'
                        }`}
                      >
                        Fecha límite
                      </button>
                    </div>

                    {endMode === 'count' ? (
                      <input
                        type="number"
                        min={2}
                        max={60}
                        value={count}
                        onChange={(e) => setCount(Number(e.target.value))}
                        aria-label="Número de sesiones"
                        className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    ) : (
                      <input
                        type="date"
                        value={until}
                        min={date || undefined}
                        onChange={(e) => setUntil(e.target.value)}
                        aria-label="Fecha límite del tratamiento"
                        className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    )}
                  </div>

                  <p className="text-xs text-text-muted">
                    Se agenda una sesión por cada día marcado. Si alguna fecha ya está ocupada, se
                    omite y te avisamos cuál.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1 h-11" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 h-11" disabled={saving}>
                {saving ? 'Guardando…' : repeat ? 'Crear tratamiento' : 'Crear Cita'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Resultado del tratamiento ────────────────────────────────────────

/**
 * Resumen tras crear un tratamiento con fechas omitidas.
 *
 * Va como modal y no como toast a propósito: el usuario necesita LEER qué
 * sesiones quedaron sin agendar para reprogramarlas, y un aviso que se
 * desvanece solo se pierde justo cuando importa.
 */
function SeriesResultModal({ result, onClose }: { result: SeriesResult; onClose: () => void }) {
  const dialogRef = useDialogA11y(onClose);
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-BO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(2,6,23,0.4)] p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Resultado del tratamiento"
        className="bg-surface-raised rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-modal max-h-[90dvh] overflow-y-auto"
      >
        <div className="border-b border-border px-5 py-4">
          <p className="font-semibold text-text-primary">Tratamiento agendado</p>
        </div>

        <div className="space-y-4 p-5">
          <p className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <CalendarCheck className="size-4 text-[var(--success)]" />
            <span>
              <strong className="text-text-primary">{result.created}</strong>{' '}
              {result.created === 1 ? 'sesión agendada' : 'sesiones agendadas'}
            </span>
          </p>

          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary">
              <CalendarX2 className="size-4 text-[var(--warning)]" />
              {result.skipped.length} sin agendar
            </p>
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
              {result.skipped.map((sk) => (
                <li key={sk.startTime} className="px-3 py-2.5">
                  <p className="text-sm font-medium text-text-primary">{fmt(sk.startTime)}</p>
                  <p className="text-xs text-text-muted">{sk.reason}</p>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-text-muted">
              Puedes agendarlas a otra hora desde el calendario.
            </p>
          </div>
        </div>

        <div className="px-5 pb-5">
          <Button className="h-11 w-full" onClick={onClose}>
            Entendido
          </Button>
        </div>
      </div>
    </div>
  );
}
