'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/panel-auth';
import {
  getAppointments,
  createAppointment,
  approvePayment,
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
import { StatusBadge, fmtDateTime, ErrorBox, Spinner } from '@/components/panel/ui';
import { SkeletonList } from '@/components/panel/Skeleton';

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
  const [tab, setTab] = useState<Tab>('pendientes');
  const [pendingItems, setPendingItems] = useState<AppointmentListItem[]>([]);
  const [confirmedItems, setConfirmedItems] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [receiptAppt, setReceiptAppt] = useState<AppointmentListItem | null>(null);
  const [showNewAppt, setShowNewAppt] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
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
      setError(err instanceof PanelApiError ? err.message : 'Error al cargar citas');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = async (id: string) => {
    if (!session) return;
    try {
      await approvePayment(session.token, session.slug, id);
      void load();
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'Error al aprobar pago');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Citas</h1>
        <button
          onClick={() => setShowNewAppt(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
        >
          + Nueva Cita
        </button>
      </div>

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
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
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

      {error && <ErrorBox message={error} />}

      {loading ? (
        <SkeletonList />
      ) : tab === 'pendientes' ? (
        <PendingTab items={pendingItems} onViewReceipt={setReceiptAppt} onApprove={handleApprove} />
      ) : (
        <ConfirmedTab items={confirmedItems} />
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
          onClose={() => setShowNewAppt(false)}
          onCreated={() => {
            setShowNewAppt(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ─── Pending tab ───────────────────────────────────────────────────────

function PendingTab({
  items,
  onViewReceipt,
  onApprove,
}: {
  items: AppointmentListItem[];
  onViewReceipt: (a: AppointmentListItem) => void;
  onApprove: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <p className="text-gray-500 text-sm py-8 text-center">No hay citas pendientes de pago.</p>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
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
              <button
                onClick={() => onViewReceipt(a)}
                className="flex-1 py-1.5 text-sm font-medium border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition"
              >
                Ver Comprobante
              </button>
            ) : (
              <span className="flex-1 py-1.5 text-sm text-center text-gray-400 border border-dashed border-gray-200 rounded-lg">
                Esperando comprobante
              </span>
            )}
            {a.receiptUrl && (
              <button
                onClick={() => onApprove(a.id)}
                className="flex-1 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                Aprobar Pago
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Confirmed tab ─────────────────────────────────────────────────────

function ConfirmedTab({ items }: { items: AppointmentListItem[] }) {
  if (!items.length) {
    return <p className="text-gray-500 text-sm py-8 text-center">No hay citas confirmadas.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.id} className="bg-white rounded-xl border border-gray-100 p-4">
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

  const handleApprove = async () => {
    setApproving(true);
    await onApprove();
    setApproving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900">Comprobante de pago</p>
            <p className="text-sm text-gray-500">{appt.patient.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={appt.receiptUrl!}
            alt="Comprobante de pago"
            className="w-full rounded-xl border border-gray-100 object-contain max-h-72"
          />
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          >
            Cerrar
          </button>
          <button
            onClick={handleApprove}
            disabled={approving}
            className="flex-1 py-2 text-sm font-medium bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-60 transition"
          >
            {approving ? 'Aprobando…' : 'Aprobar Pago'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Nueva Cita modal ─────────────────────────────────────────────────

function NewAppointmentModal({
  token,
  slug,
  onClose,
  onCreated,
}: {
  token: string;
  slug: string;
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
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getPatients(token, slug, { limit: 200 }), getDoctorsAdmin(token, slug)])
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
      setError('Completa todos los campos');
      return;
    }
    const startTime = new Date(`${date}T${time}:00`).toISOString();
    const endTime = new Date(new Date(startTime).getTime() + durationMin * 60_000).toISOString();
    setSaving(true);
    setError('');
    try {
      await createAppointment(token, slug, {
        patientId,
        doctorId,
        serviceId,
        startTime,
        endTime,
        paymentMethod,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'Error al crear cita');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <p className="font-semibold text-gray-900">Nueva Cita</p>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {loadingInit ? (
          <div className="py-10">
            <Spinner />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && <ErrorBox message={error} />}

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Paciente</span>
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">
                  {doctorId ? 'Seleccionar servicio…' : 'Selecciona un doctor primero'}
                </option>
                {services.map((s) => (
                  <option key={s.serviceId} value={s.serviceId}>
                    {s.service.name} — Bs {s.customDuration ? s.service.price : s.service.price} ·{' '}
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
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Hora</span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-gray-700 mb-2">Método de pago</legend>
              <div className="flex gap-3">
                {(['CASH', 'STATIC_QR'] as PaymentMethod[]).map((pm) => (
                  <label
                    key={pm}
                    className={`flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition ${paymentMethod === pm ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={pm}
                      checked={paymentMethod === pm}
                      onChange={() => setPaymentMethod(pm)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm">
                      {pm === 'CASH' ? '💵 Efectivo' : '📲 QR bancario'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-60 transition"
              >
                {saving ? 'Guardando…' : 'Crear Cita'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
