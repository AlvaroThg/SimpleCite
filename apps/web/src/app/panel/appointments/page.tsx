'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/lib/panel-auth';
import {
  getAppointments,
  createAppointment,
  approvePayment,
  rescheduleAppointment,
  getPatients,
  getDoctorsAdmin,
  getDoctorServices,
  PanelApiError,
  type AppointmentListItem,
  type PatientListItem,
  type Doctor,
  type DoctorServiceLink,
  type PaymentMethod,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { StatusBadge, fmtDateTime, Spinner } from '@/components/panel/ui';
import { SkeletonList } from '@/components/panel/Skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { CalendarCheck, Clock, X, Banknote, QrCode, List, CalendarDays } from 'lucide-react';
import { AdminCalendar, type AdminEvent } from '@/components/calendar/AdminCalendar';

// ─── Types ────────────────────────────────────────────────────────────

type Tab = 'pendientes' | 'confirmadas';

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

// ─── Page ─────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  return (
    <PanelShell>
      <AppointmentsList />
    </PanelShell>
  );
}

// ─── Main component ───────────────────────────────────────────────────

function AppointmentsList() {
  const { session } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [tab, setTab] = useState<Tab>('pendientes');
  const [pendingItems, setPendingItems] = useState<AppointmentListItem[]>([]);
  const [confirmedItems, setConfirmedItems] = useState<AppointmentListItem[]>([]);
  const [calendarItems, setCalendarItems] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [receiptAppt, setReceiptAppt] = useState<AppointmentListItem | null>(null);
  const [showNewAppt, setShowNewAppt] = useState(false);
  // Hora pre-seleccionada al hacer clic en un hueco del calendario (Nueva Cita).
  const [newApptStart, setNewApptStart] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [pending, confirmed] = await Promise.all([
        getAppointments(session.token, session.slug, { status: 'PENDING_PAYMENT' }),
        getAppointments(session.token, session.slug, { status: 'CONFIRMED' }),
      ]);
      pending.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      confirmed.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      setPendingItems(pending);
      setConfirmedItems(confirmed);
    } catch (err) {
      toast.error(err instanceof PanelApiError ? err.message : 'Error al cargar citas');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  // Carga todas las citas (cualquier estado) para la vista de calendario.
  const loadCalendar = useCallback(async () => {
    if (!session) return;
    try {
      setCalendarItems(await getAppointments(session.token, session.slug, {}));
    } catch (err) {
      toast.error(err instanceof PanelApiError ? err.message : 'Error al cargar el calendario');
    }
  }, [session]);

  useEffect(() => {
    if (view === 'calendar') void loadCalendar();
  }, [view, loadCalendar]);

  // Las canceladas no se muestran: el horario queda libre como si no existieran.
  const calendarEvents: AdminEvent[] = calendarItems
    .filter((a) => a.status !== 'CANCELLED')
    .map((a) => ({
      id: a.id,
      title: a.patient.name,
      start: new Date(a.startTime),
      end: new Date(a.endTime),
      status: a.status,
      doctorName: a.doctor.name,
      serviceName: a.service.name,
    }));

  function openNewAppt(start?: Date) {
    setNewApptStart(start ?? null);
    setShowNewAppt(true);
  }
  function closeNewAppt() {
    setShowNewAppt(false);
    setNewApptStart(null);
  }

  // Reprogramación con actualización optimista (revierte si el backend falla).
  const handleReschedule = async ({ id, start, end }: { id: string; start: Date; end: Date }) => {
    if (!session) return;
    const prev = calendarItems;
    setCalendarItems((items) =>
      items.map((a) =>
        a.id === id ? { ...a, startTime: start.toISOString(), endTime: end.toISOString() } : a,
      ),
    );
    try {
      await rescheduleAppointment(session.token, session.slug, id, start, end);
      toast.success('Cita reprogramada');
    } catch (err) {
      setCalendarItems(prev);
      toast.error(err instanceof PanelApiError ? err.message : 'No se pudo reprogramar');
    }
  };

  const handleApprove = async (id: string) => {
    if (!session || approvingId) return;
    setApprovingId(id);
    try {
      await approvePayment(session.token, session.slug, id);
      toast.success('Pago aprobado. Cita confirmada.');
      await load();
    } catch (err) {
      toast.error(err instanceof PanelApiError ? err.message : 'Error al aprobar pago');
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">Citas</h1>
        <div className="flex items-center gap-2">
          {/* Toggle Lista / Calendario */}
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(
              [
                ['list', 'Lista', List],
                ['calendar', 'Calendario', CalendarDays],
              ] as [typeof view, string, typeof List][]
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  view === key
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <Button onClick={() => openNewAppt()}>+ Nueva Cita</Button>
        </div>
      </div>

      {view === 'calendar' ? (
        <>
          <p className="text-xs text-gray-400">
            Tocá un hueco libre para crear una cita, o arrastrá una cita para reprogramarla.
          </p>
          <AdminCalendar
            events={calendarEvents}
            onSelectEvent={(e) => router.push(`/panel/appointments/${e.id}`)}
            onSelectSlot={(s) => openNewAppt(s.start)}
            onReschedule={handleReschedule}
          />
        </>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {(
              [
                ['pendientes', 'Pendientes de Pago'],
                ['confirmadas', 'Confirmadas'],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`min-h-11 px-4 rounded-lg text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                  tab === key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
                {key === 'pendientes' && pendingItems.length > 0 && (
                  <span className="ml-1.5 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {pendingItems.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <SkeletonList />
          ) : tab === 'pendientes' ? (
            <PendingTab
              items={pendingItems}
              approvingId={approvingId}
              onViewReceipt={setReceiptAppt}
              onApprove={handleApprove}
            />
          ) : (
            <ConfirmedTab items={confirmedItems} />
          )}
        </>
      )}

      {/* Receipt modal */}
      {receiptAppt && (
        <ReceiptModal
          appt={receiptAppt}
          onClose={() => setReceiptAppt(null)}
          onApprove={async () => {
            await handleApprove(receiptAppt.id);
            setReceiptAppt(null);
          }}
        />
      )}

      {/* Nueva Cita modal */}
      {showNewAppt && session && (
        <NewAppointmentModal
          token={session.token}
          slug={session.slug}
          initialStart={newApptStart ?? undefined}
          onClose={closeNewAppt}
          onCreated={() => {
            closeNewAppt();
            void load();
            void loadCalendar();
          }}
        />
      )}
    </div>
  );
}

// ─── Pending tab ───────────────────────────────────────────────────────

function PendingTab({
  items,
  approvingId,
  onViewReceipt,
  onApprove,
}: {
  items: AppointmentListItem[];
  approvingId: string | null;
  onViewReceipt: (a: AppointmentListItem) => void;
  onApprove: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <EmptyState
        icon={<Clock />}
        title="No hay pagos pendientes"
        description="Las reservas que esperan comprobante o aprobación aparecerán aquí."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((a) => {
        const approving = approvingId === a.id;
        return (
          <li
            key={a.id}
            className="bg-white rounded-xl border border-amber-200 p-4 space-y-3 transition-all hover:border-brand-300 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{a.patient.name}</p>
                <p className="text-sm text-gray-500 truncate">
                  {a.service.name} · {a.doctor.name}
                </p>
                <p className="text-sm text-gray-600 mt-0.5">{fmtDateTime(a.startTime)}</p>
              </div>
              <StatusBadge status={a.status} />
            </div>
            <div className="flex gap-2">
              {a.receiptUrl ? (
                <Button variant="outline" className="flex-1 h-11" onClick={() => onViewReceipt(a)}>
                  Ver Comprobante
                </Button>
              ) : (
                <span className="flex-1 flex items-center justify-center min-h-11 text-sm text-center text-gray-400 border border-dashed border-gray-200 rounded-lg">
                  Esperando comprobante
                </span>
              )}
              {a.receiptUrl && (
                <Button
                  className="flex-1 h-11 bg-green-700 hover:bg-green-800 text-white"
                  disabled={approving}
                  onClick={() => onApprove(a.id)}
                >
                  {approving ? 'Aprobando…' : 'Aprobar Pago'}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Confirmed tab ─────────────────────────────────────────────────────

function ConfirmedTab({ items }: { items: AppointmentListItem[] }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={<CalendarCheck />}
        title="Aún no hay citas confirmadas"
        description="Las citas confirmadas (efectivo o QR pagado) se mostrarán aquí."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li
          key={a.id}
          className="bg-white rounded-xl border border-gray-100 p-4 transition-all hover:border-brand-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{a.patient.name}</p>
              <p className="text-sm text-gray-500 truncate">
                {a.service.name} · {a.doctor.name}
              </p>
              <p className="text-sm text-gray-600 mt-0.5">{fmtDateTime(a.startTime)}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <StatusBadge status={a.status} />
              {a.paymentMethod === 'CASH' ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
                  Por cobrar en clínica
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                  QR Pagado
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Receipt modal ─────────────────────────────────────────────────────

function ReceiptModal({
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Comprobante de pago de ${appt.patient.name}`}
        className="bg-white rounded-2xl w-full max-w-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900">Comprobante de pago</p>
            <p className="text-sm text-gray-500">{appt.patient.name}</p>
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
            className="mx-auto w-full rounded-xl border border-gray-100 bg-gray-50 object-contain max-h-[70vh]"
          />
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <Button variant="outline" className="flex-1 h-11" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            className="flex-1 h-11 bg-green-700 hover:bg-green-800 text-white"
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
function toTimeInput(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function NewAppointmentModal({
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
  const [doctorId, setDoctorId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(initialStart ? toDateInput(initialStart) : '');
  const [time, setTime] = useState(initialStart ? toTimeInput(initialStart) : '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
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

  const selectedService = services.find((s) => s.serviceId === serviceId);
  const durationMin = selectedService?.customDuration ?? selectedService?.service.duration ?? 30;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !doctorId || !serviceId || !date || !time) {
      toast.error('Completa todos los campos');
      return;
    }
    const startTime = new Date(`${date}T${time}:00`).toISOString();
    const endTime = new Date(new Date(startTime).getTime() + durationMin * 60_000).toISOString();
    setSaving(true);
    try {
      await createAppointment(token, slug, {
        patientId,
        doctorId,
        serviceId,
        startTime,
        endTime,
        paymentMethod,
      });
      toast.success('Cita creada.');
      onCreated();
    } catch (err) {
      toast.error(err instanceof PanelApiError ? err.message : 'Error al crear cita');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Nueva cita"
        className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <p className="font-semibold text-gray-900">Nueva Cita</p>
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
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Paciente</span>
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Seleccionar paciente…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.phone}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Doctor</span>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
              <span className="text-sm font-medium text-gray-700">Servicio</span>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                required
                disabled={!doctorId || services.length === 0}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-gray-50 disabled:text-gray-400"
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

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Fecha</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  min={new Date().toISOString().slice(0, 10)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Hora</span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-gray-700 mb-2">Método de pago</legend>
              <div className="flex gap-3">
                {(['CASH', 'STATIC_QR'] as PaymentMethod[]).map((pm) => (
                  <label
                    key={pm}
                    className={`flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition ${paymentMethod === pm ? 'border-brand-500 bg-accent' : 'border-gray-200 hover:border-gray-300'}`}
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
                          <Banknote className="size-4 text-gray-400" /> Efectivo
                        </>
                      ) : (
                        <>
                          <QrCode className="size-4 text-gray-400" /> QR bancario
                        </>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

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
