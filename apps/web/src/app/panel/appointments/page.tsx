'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/lib/panel-auth';
import {
  getAppointments,
  createAppointment,
  approvePayment,
  rescheduleAppointment,
  getPatients,
  createPatient,
  getDoctorsAdmin,
  getDoctorServices,
  getSlots,
  getTenantConfig,
  getDoctorInsurances,
  PanelApiError,
  type AppointmentListItem,
  type PatientListItem,
  type Doctor,
  type DoctorServiceLink,
  type PaymentMethod,
  type PanelSlot,
  type TenantConfig,
  type DoctorInsuranceOption,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { StatusBadge, fmtDateTime, Spinner } from '@/components/panel/ui';
import { SkeletonList } from '@/components/panel/Skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { PhoneField } from '@/components/PhoneField';
import {
  CalendarCheck,
  Clock,
  X,
  Banknote,
  QrCode,
  List,
  CalendarDays,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { AdminCalendar, type AdminEvent } from '@/components/calendar/AdminCalendar';

// ─── Celdas de tabla compartidas (sistema de diseño) ──────────────────

/** Celda de paciente: avatar de iniciales + nombre + CI (o teléfono), en mono. */
function PatientCell({ a }: { a: AppointmentListItem }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={a.patient.name} size="sm" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-text-primary">{a.patient.name}</div>
        <div className="truncate font-mono text-[11.5px] text-text-muted">
          {a.patient.ci ? `CI ${a.patient.ci}` : a.patient.phone}
        </div>
      </div>
    </div>
  );
}

/** Celda de pago: badge QR + monto, "Efectivo", o el seguro que cubre la cita. */
function PayCell({ a }: { a: AppointmentListItem }) {
  if (a.paymentMethod === 'INSURANCE') {
    // Nombre congelado al crear la cita (snapshot) — nunca el string "INSURANCE".
    return (
      <span className="inline-flex items-center gap-1.5 text-text-secondary">
        <ShieldCheck className="size-4 text-text-muted" />
        {a.insuranceNameSnapshot ?? 'Seguro'}
      </span>
    );
  }
  if (a.paymentMethod === 'CASH') {
    return <span className="text-text-secondary">Efectivo</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-text-secondary">
      <span className="rounded-md border border-border bg-canvas px-1.5 py-px font-mono text-[11px] text-text-muted">
        QR
      </span>
      {/* Monto congelado de la cita (respeta overrides); legacy → precio actual. */}
      Bs {a.price ?? a.service.price}
    </span>
  );
}

/** Glifo de WhatsApp (mismo trazo que el botón del booking). */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.5 14.4c-.3-.15-1.8-.9-2.08-1-.28-.1-.48-.15-.68.15-.2.3-.78 1-.96 1.2-.18.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.68-2.08-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.68-1.64-.93-2.24-.24-.58-.5-.5-.68-.51h-.58c-.2 0-.53.08-.8.38-.28.3-1.05 1.03-1.05 2.5 0 1.48 1.08 2.9 1.23 3.1.15.2 2.12 3.24 5.14 4.54.72.3 1.28.48 1.72.62.72.23 1.38.2 1.9.12.58-.08 1.8-.73 2.05-1.44.25-.7.25-1.3.18-1.44-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.6 15.06L2 22l5.06-1.33A10 10 0 1 0 12 2z" />
    </svg>
  );
}

const TH =
  'whitespace-nowrap border-b border-border bg-canvas px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted';
const TD =
  'border-b border-[var(--border-hairline)] px-4 py-3 align-middle text-sm text-text-secondary';

/** Tarjeta de cita para móvil (reemplaza la tabla en pantallas chicas). */
function ApptCard({
  a,
  onOpen,
  children,
}: {
  a: AppointmentListItem;
  onOpen?: (id: string) => void;
  children?: ReactNode;
}) {
  return (
    <li
      onClick={onOpen ? () => onOpen(a.id) : undefined}
      className={`rounded-xl border border-border bg-surface p-4 shadow-card ${
        onOpen ? 'cursor-pointer transition-colors hover:border-brand-300' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <PatientCell a={a} />
        <StatusBadge status={a.status} />
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-text-muted">Servicio</dt>
        <dd className="text-right text-text-secondary">{a.service.name}</dd>
        <dt className="text-text-muted">Doctor</dt>
        <dd className="text-right text-text-secondary">{a.doctor.name}</dd>
        <dt className="text-text-muted">Cuándo</dt>
        <dd className="text-right text-text-secondary">{fmtDateTime(a.startTime)}</dd>
        <dt className="text-text-muted">Pago</dt>
        <dd className="text-right">
          <PayCell a={a} />
        </dd>
      </dl>
      {/* Las acciones no deben disparar la navegación de la tarjeta. */}
      {children && (
        <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </li>
  );
}

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
  // Config del tenant + QR por doctor: para armar el link de WhatsApp que manda
  // el QR de pago al paciente (número general vía el QR del especialista o el general).
  const [tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null);
  const [doctorQrMap, setDoctorQrMap] = useState<Record<string, string | null>>({});

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

  // Config del tenant + mapa doctorId→qrUrl (una vez). Best-effort: si falla,
  // el botón de "Enviar QR" simplemente no aparece.
  useEffect(() => {
    if (!session) return;
    Promise.all([
      getTenantConfig(session.token, session.slug),
      getDoctorsAdmin(session.token, session.slug),
    ])
      .then(([cfg, docs]) => {
        setTenantConfig(cfg);
        setDoctorQrMap(Object.fromEntries(docs.map((d) => [d.id, d.qrUrl])));
      })
      .catch(() => {});
  }, [session]);

  // Link wa.me que abre el chat con el paciente y le manda el QR de pago:
  // en modo PER_DOCTOR usa el QR del especialista (o el general si no tiene);
  // en modo SHARED, el QR general de la clínica. Solo para citas QR con teléfono.
  const qrWaLink = useCallback(
    (a: AppointmentListItem): string | null => {
      if (a.paymentMethod !== 'STATIC_QR' || !tenantConfig) return null;
      const phone = a.patient.phone?.replace(/\D/g, '');
      if (!phone) return null;
      const qrUrl =
        tenantConfig.qrAssignmentMode === 'PER_DOCTOR'
          ? doctorQrMap[a.doctor.id] || tenantConfig.staticQrUrl
          : tenantConfig.staticQrUrl;
      if (!qrUrl) return null;
      const msg =
        `Hola ${a.patient.name}, para confirmar tu cita del ${fmtDateTime(a.startTime)} ` +
        `con ${a.doctor.name} en ${tenantConfig.name}, realiza el pago escaneando este QR:\n${qrUrl}\n\n` +
        `Cuando pagues, envíanos la foto del comprobante por aquí. ¡Gracias!`;
      return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    },
    [tenantConfig, doctorQrMap],
  );

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
      color: a.service.color ?? null,
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
    <div className="space-y-4">
      {/* Toolbar: toggle Lista/Calendario · tabs con contador · Nueva cita */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Segmented Lista / Calendario */}
        <div className="inline-flex rounded-md border border-border bg-surface p-[3px]">
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
              className={`inline-flex items-center gap-1.5 rounded-[6px] px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                view === key
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon className="size-[15px]" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {view === 'list' && (
          <div className="flex items-center gap-1">
            {(
              [
                ['pendientes', 'Pendientes de pago', pendingItems.length],
                ['confirmadas', 'Confirmadas', confirmedItems.length],
              ] as [Tab, string, number][]
            ).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`flex items-center gap-2 border-b-2 px-1 py-1.5 text-sm font-medium transition-colors outline-none ${
                  tab === key
                    ? 'border-primary text-text-primary'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {label}
                <span
                  className={`rounded-full border px-[7px] py-px text-[11px] font-semibold ${
                    tab === key
                      ? 'border-transparent bg-accent text-primary'
                      : 'border-border bg-canvas text-text-secondary'
                  }`}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
        )}

        <Button onClick={() => openNewAppt()} size="sm" className="ml-auto">
          <Plus className="size-4" /> Nueva cita
        </Button>
      </div>

      {view === 'calendar' ? (
        <>
          <p className="text-xs text-text-muted">
            Tocá un hueco libre para crear una cita, o arrastrá una cita para reprogramarla.
          </p>
          <AdminCalendar
            events={calendarEvents}
            onSelectEvent={(e) => router.push(`/panel/appointments/${e.id}`)}
            onSelectSlot={(s) => openNewAppt(s.start)}
            onReschedule={handleReschedule}
          />
        </>
      ) : loading ? (
        <SkeletonList />
      ) : tab === 'pendientes' ? (
        <PendingTab
          items={pendingItems}
          approvingId={approvingId}
          onViewReceipt={setReceiptAppt}
          onApprove={handleApprove}
          qrWaLink={qrWaLink}
          onOpen={(id) => router.push(`/panel/appointments/${id}`)}
        />
      ) : (
        <ConfirmedTab
          items={confirmedItems}
          onOpen={(id) => router.push(`/panel/appointments/${id}`)}
        />
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
  qrWaLink,
  onOpen,
}: {
  items: AppointmentListItem[];
  approvingId: string | null;
  onViewReceipt: (a: AppointmentListItem) => void;
  onApprove: (id: string) => void;
  qrWaLink: (a: AppointmentListItem) => string | null;
  onOpen: (id: string) => void;
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
  const actions = (a: AppointmentListItem, block: boolean) => {
    const approving = approvingId === a.id;
    if (a.receiptUrl) {
      return (
        <>
          <Button
            variant="outline"
            size="sm"
            className={block ? 'flex-1' : ''}
            onClick={() => onViewReceipt(a)}
          >
            Comprobante
          </Button>
          <Button
            size="sm"
            className={block ? 'flex-1' : ''}
            disabled={approving}
            onClick={() => onApprove(a.id)}
          >
            {approving ? 'Aprobando…' : 'Aprobar'}
          </Button>
        </>
      );
    }
    // Aún sin comprobante. Si es cita QR, ofrecemos mandarle el QR al WhatsApp del
    // paciente (abre el chat con el mensaje listo). El staff confirma de buena fe
    // el pago (efectivo, o QR revisado en su banco) con "Confirmar pago recibido".
    const waLink = qrWaLink(a);
    return (
      <>
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium text-text-secondary transition hover:border-border-strong ${block ? 'flex-1' : ''}`}
          >
            <WhatsAppGlyph className="size-4 text-whatsapp" /> Enviar QR
          </a>
        )}
        <Button
          size="sm"
          className={block ? 'flex-1' : ''}
          disabled={approving}
          onClick={() => onApprove(a.id)}
        >
          {approving ? 'Confirmando…' : 'Confirmar pago recibido'}
        </Button>
      </>
    );
  };
  return (
    <>
      {/* Móvil: tarjetas */}
      <ul className="space-y-3 md:hidden">
        {items.map((a) => (
          <ApptCard key={a.id} a={a} onOpen={onOpen}>
            {actions(a, true)}
          </ApptCard>
        ))}
      </ul>

      {/* Desktop: tabla (fila completa clickeable → detalle) */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Paciente</th>
                <th className={TH}>Servicio</th>
                <th className={TH}>Doctor</th>
                <th className={TH}>Fecha y hora</th>
                <th className={TH}>Pago</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => onOpen(a.id)}
                  className="cursor-pointer transition-colors last:[&>td]:border-b-0 hover:bg-canvas"
                >
                  <td className={`${TD} shadow-[inset_2px_0_0_var(--warning)]`}>
                    <PatientCell a={a} />
                  </td>
                  <td className={TD}>{a.service.name}</td>
                  <td className={TD}>{a.doctor.name}</td>
                  <td className={`${TD} whitespace-nowrap`}>{fmtDateTime(a.startTime)}</td>
                  <td className={TD}>
                    <PayCell a={a} />
                  </td>
                  <td className={TD}>
                    <StatusBadge status={a.status} />
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {/* Los botones no deben disparar la navegación de la fila. */}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {actions(a, false)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Confirmed tab ─────────────────────────────────────────────────────

function ConfirmedTab({
  items,
  onOpen,
}: {
  items: AppointmentListItem[];
  onOpen: (id: string) => void;
}) {
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
    <>
      {/* Móvil: tarjetas */}
      <ul className="space-y-3 md:hidden">
        {items.map((a) => (
          <ApptCard key={a.id} a={a} onOpen={onOpen} />
        ))}
      </ul>

      {/* Desktop: tabla (fila completa clickeable → detalle) */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Paciente</th>
                <th className={TH}>Servicio</th>
                <th className={TH}>Doctor</th>
                <th className={TH}>Fecha y hora</th>
                <th className={TH}>Pago</th>
                <th className={TH}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => onOpen(a.id)}
                  className="cursor-pointer transition-colors last:[&>td]:border-b-0 hover:bg-canvas"
                >
                  <td className={TD}>
                    <PatientCell a={a} />
                  </td>
                  <td className={TD}>{a.service.name}</td>
                  <td className={TD}>{a.doctor.name}</td>
                  <td className={`${TD} whitespace-nowrap`}>{fmtDateTime(a.startTime)}</td>
                  <td className={TD}>
                    <PayCell a={a} />
                  </td>
                  <td className={TD}>
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
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
