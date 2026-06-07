'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/panel-auth';
import {
  getAppointment,
  transitionAppointment,
  PanelApiError,
  type AppointmentDetail,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { StatusBadge, fmtDate, fmtTime, ErrorBox } from '@/components/panel/ui';
import { SkeletonDetail } from '@/components/panel/Skeleton';

// Transiciones permitidas desde el panel (espejo del backend state machine).
const TRANSITIONS: Record<string, { status: string; label: string; cls: string }[]> = {
  PENDING_PAYMENT: [
    { status: 'CONFIRMED', label: 'Confirmar', cls: 'bg-green-600 hover:bg-green-700' },
    { status: 'CANCELLED', label: 'Cancelar', cls: 'bg-red-600 hover:bg-red-700' },
  ],
  CONFIRMED: [
    { status: 'COMPLETED', label: 'Marcar completada', cls: 'bg-blue-600 hover:bg-blue-700' },
    { status: 'NO_SHOW', label: 'No asistió', cls: 'bg-orange-600 hover:bg-orange-700' },
    { status: 'CANCELLED', label: 'Cancelar', cls: 'bg-red-600 hover:bg-red-700' },
  ],
};

export default function AppointmentDetailPage() {
  return (
    <PanelShell>
      <AppointmentDetailView />
    </PanelShell>
  );
}

function AppointmentDetailView() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [appt, setAppt] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      setAppt(await getAppointment(session.token, session.slug, id));
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'Error al cargar la cita');
    } finally {
      setLoading(false);
    }
  }, [session, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function doTransition(status: string) {
    if (!session) return;
    setActing(true);
    setError('');
    try {
      await transitionAppointment(session.token, session.slug, id, status);
      await load();
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo actualizar el estado');
    } finally {
      setActing(false);
    }
  }

  if (loading) return <SkeletonDetail />;
  if (error && !appt) return <ErrorBox message={error} />;
  if (!appt) return null;

  const transitions = TRANSITIONS[appt.status] ?? [];

  return (
    <div className="space-y-5">
      <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-800">
        ← Volver
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{appt.patient.name}</h1>
            <p className="text-sm text-gray-500">{appt.patient.phone}</p>
            {appt.patient.ci && <p className="text-sm text-gray-500">CI: {appt.patient.ci}</p>}
          </div>
          <StatusBadge status={appt.status} />
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm border-t border-gray-100 pt-4">
          <Info label="Fecha" value={fmtDate(appt.startTime)} />
          <Info label="Hora" value={`${fmtTime(appt.startTime)} – ${fmtTime(appt.endTime)}`} />
          <Info label="Servicio" value={appt.service.name} />
          <Info label="Doctor" value={appt.doctor.name} />
          <Info label="Precio" value={`Bs ${Number(appt.service.price).toFixed(2)}`} />
          <Info label="Pago" value={appt.isPaid ? '✅ Pagado' : 'Pendiente'} />
        </dl>

        <div className="border-t border-gray-100 pt-4">
          <Link
            href={`/panel/patients/${appt.patient.id}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Ver historial clínico del paciente →
          </Link>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {transitions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Acciones
          </p>
          <div className="flex flex-wrap gap-2">
            {transitions.map((t) => (
              <button
                key={t.status}
                onClick={() => doTransition(t.status)}
                disabled={acting}
                className={`px-4 py-2 rounded-xl text-white text-sm font-semibold transition disabled:opacity-50 ${t.cls}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-400 text-xs">{label}</dt>
      <dd className="text-gray-800 font-medium">{value}</dd>
    </div>
  );
}
