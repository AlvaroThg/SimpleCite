'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/panel-auth';
import { getAppointments, PanelApiError, type AppointmentListItem } from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { StatusBadge, fmtDateTime, ErrorBox } from '@/components/panel/ui';
import { SkeletonList } from '@/components/panel/Skeleton';

const STATUS_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'CONFIRMED', label: 'Confirmadas' },
  { value: 'PENDING_PAYMENT', label: 'Pago pendiente' },
  { value: 'COMPLETED', label: 'Completadas' },
  { value: 'CANCELLED', label: 'Canceladas' },
];

export default function AppointmentsPage() {
  return (
    <PanelShell>
      <AppointmentsList />
    </PanelShell>
  );
}

function AppointmentsList() {
  const { session } = useAuth();
  const [items, setItems] = useState<AppointmentListItem[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const data = await getAppointments(session.token, session.slug, {
        status: status || undefined,
      });
      // Orden cronológico ascendente por hora de inicio
      data.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      setItems(data);
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'Error al cargar citas');
    } finally {
      setLoading(false);
    }
  }, [session, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Citas</h1>
      </div>

      {/* Filtros de estado */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition ${
              status === f.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <ErrorBox message={error} />}
      {loading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">No hay citas para este filtro.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id}>
              <Link
                href={`/panel/appointments/${a.id}`}
                className="block bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-300 hover:shadow-sm transition"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{a.patient.name}</p>
                    <p className="text-sm text-gray-500 truncate">
                      {a.service.name} · {a.doctor.name}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-medium text-gray-700">{fmtDateTime(a.startTime)}</p>
                    <div className="mt-1">
                      <StatusBadge status={a.status} />
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
