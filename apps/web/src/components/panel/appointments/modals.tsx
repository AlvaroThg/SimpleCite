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
import { X, Banknote, QrCode, ShieldCheck } from 'lucide-react';

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
  onClose,
  onCreated,
}: {
  token: string;
  slug: string;
  initialStart?: Date;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<DoctorServiceLink[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);

  const [patientId, setPatientId] = useState('');
  const [patientMode, setPatientMode] = useState<'existing' | 'new'>('existing');
  const [newPatient, setNewPatient] = useState({ name: '', phone: '', ci: '' });
  const [doctorId, setDoctorId] = useState('');
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
  const dialogRef = useDialogA11y(onClose);

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
    if (patientMode === 'new' && (!newPatient.name.trim() || !newPatient.phone.trim())) {
      toast.error('Nombre y teléfono del nuevo paciente son obligatorios');
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
          phone: newPatient.phone.trim(),
          ci: newPatient.ci.trim() || undefined,
        });
        pid = created.id;
      }
      await createAppointment(token, slug, {
        patientId: pid,
        doctorId,
        serviceId,
        startTime,
        endTime,
        // Modo seguro: se confirma directo con el seguro elegido (sin cobro).
        paymentMethod: insuranceMode ? 'INSURANCE' : paymentMethod,
        ...(insuranceMode && { tenantInsuranceId: insuranceId }),
      });
      toast.success('Cita creada.');
      onCreated();
    } catch (err) {
      toast.error(err instanceof PanelApiError ? err.message : 'Error al crear cita');
      setSaving(false);
    }
  };

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
                <select
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Seleccionar paciente…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.phone}
                    </option>
                  ))}
                </select>
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
                    placeholder="CI (opcional)"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-text-muted">
                    Si el teléfono o CI ya existe, se usará ese paciente (no se duplica).
                  </p>
                </div>
              )}
            </div>

            <label className="block">
              <span className="text-sm font-medium text-text-secondary">Doctor</span>
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

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1 h-11" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 h-11" disabled={saving}>
                {saving ? 'Guardando…' : 'Crear Cita'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
