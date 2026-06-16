'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { CalendarDays, Wallet, TrendingDown, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/panel-auth';
import { getReportsSummary, PanelApiError, type ReportsSummary } from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { fmtDateTime, ErrorBox } from '@/components/panel/ui';
import { SkeletonCards } from '@/components/panel/Skeleton';

export default function PanelHome() {
  return (
    <PanelShell>
      <Home />
    </PanelShell>
  );
}

function Home() {
  const { session } = useAuth();
  const [data, setData] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      setData(await getReportsSummary(session.token, session.slug));
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'Error al cargar el resumen');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Hola, {session?.user.name}</h1>
        <p className="text-sm text-gray-500">Resumen de tu clínica</p>
      </div>

      {error && <ErrorBox message={error} />}

      {loading ? (
        <SkeletonCards count={3} />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Metric label="Citas de hoy" value={String(data.citasHoy)} icon={CalendarDays} />
            <Metric
              label="Ingresos del mes"
              value={`Bs ${data.ingresosMes.toFixed(0)}`}
              icon={Wallet}
            />
            <Metric
              label="Inasistencia (30d)"
              value={`${data.tasaInasistencia}%`}
              icon={TrendingDown}
              warn={data.tasaInasistencia > 20}
            />
          </div>

          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Próximas citas</h2>
            {data.proximasCitas.length === 0 ? (
              <p className="text-gray-400 text-sm">No hay citas confirmadas próximas.</p>
            ) : (
              <ul className="space-y-2">
                {data.proximasCitas.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/panel/appointments/${c.id}`}
                      className="block bg-white rounded-xl border border-gray-100 p-4 hover:border-brand-300 transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{c.patientName}</p>
                          <p className="text-sm text-gray-500 truncate">
                            {c.serviceName} · {c.doctorName}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-gray-700 flex-shrink-0">
                          {fmtDateTime(c.startTime)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  warn,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  warn?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
        <span
          className={`flex size-9 items-center justify-center rounded-lg ${
            warn ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600'
          }`}
        >
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className={`mt-2 text-3xl font-extrabold ${warn ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}
