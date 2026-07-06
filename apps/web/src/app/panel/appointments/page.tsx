'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/lib/panel-auth';
import {
  getAppointments,
  approvePayment,
  rescheduleAppointment,
  getDoctorsAdmin,
  getTenantConfig,
  PanelApiError,
  type AppointmentListItem,
  type TenantConfig,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { fmtDateTime } from '@/components/panel/ui';
import { SkeletonList } from '@/components/panel/Skeleton';
import { Button } from '@/components/ui/button';
import { List, CalendarDays, Plus } from 'lucide-react';
import { AdminCalendar, type AdminEvent } from '@/components/calendar/AdminCalendar';
import { PendingTab, ConfirmedTab } from '@/components/panel/appointments/cells';
import { ReceiptModal, NewAppointmentModal } from '@/components/panel/appointments/modals';

// ─── Types ────────────────────────────────────────────────────────────

type Tab = 'pendientes' | 'confirmadas';

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
