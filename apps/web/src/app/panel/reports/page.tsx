'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Download, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/panel-auth';
import {
  getReportsAnalytics,
  downloadReportsPdf,
  PanelApiError,
  type ReportAnalytics,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { ErrorBox } from '@/components/panel/ui';
import { SkeletonCards } from '@/components/panel/Skeleton';
import { Button } from '@/components/ui/button';

export default function ReportsPage() {
  return (
    <PanelShell>
      <Reports />
    </PanelShell>
  );
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function money(n: number): string {
  return `Bs ${n.toLocaleString('es-BO', { maximumFractionDigits: 0 })}`;
}

function Reports() {
  const { session } = useAuth();
  const isAdmin = session?.user.role === 'ADMIN';

  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);

  const [from, setFrom] = useState(ymd(monthAgo));
  const [to, setTo] = useState(ymd(today));
  const [data, setData] = useState<ReportAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const range = useCallback(
    () => ({
      fromIso: new Date(`${from}T00:00:00`).toISOString(),
      toIso: new Date(`${to}T23:59:59`).toISOString(),
    }),
    [from, to],
  );

  const load = useCallback(async () => {
    if (!session || !isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const { fromIso, toIso } = range();
      setData(await getReportsAnalytics(session.token, session.slug, fromIso, toIso));
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo cargar el reporte');
    } finally {
      setLoading(false);
    }
  }, [session, isAdmin, range]);

  useEffect(() => {
    void load();
  }, [load]);

  async function download() {
    if (!session) return;
    setDownloading(true);
    try {
      const { fromIso, toIso } = range();
      await downloadReportsPdf(session.token, session.slug, fromIso, toIso);
    } catch (err) {
      toast.error(err instanceof PanelApiError ? err.message : 'No se pudo descargar el PDF');
    } finally {
      setDownloading(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-text-primary">Reportes</h1>
        <ErrorBox message="Solo los administradores pueden ver los reportes." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Reportes</h1>
          <p className="mt-1 text-sm text-text-muted">
            Ingresos y actividad por doctor en el período.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-text-muted">
            Desde
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <label className="text-xs text-text-muted">
            Hasta
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <Button variant="outline" size="sm" disabled={downloading || !data} onClick={download}>
            <Download className="size-4" />
            {downloading ? 'Generando…' : 'PDF'}
          </Button>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {loading ? (
        <SkeletonCards count={4} />
      ) : data ? (
        <>
          {/* Tarjetas de resumen */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Ingresos" value={money(data.totals.income)} accent />
            <StatCard label="Completadas" value={String(data.totals.completed)} />
            <StatCard label="Canceladas" value={String(data.totals.cancelled)} />
            <StatCard label="No se presentó" value={String(data.totals.noShow)} />
          </div>

          {/* Desglose de ingresos: Efectivo · QR · una columna por seguro */}
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-1 text-sm font-semibold text-text-secondary">Desglose de ingresos</h2>
            <p className="mb-4 text-xs text-text-muted">
              Las citas por seguro no generan cobro al paciente (Bs 0); su valor referencial es el
              precio de lista del servicio.
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Efectivo" value={money(data.incomeByMethod.cash)} />
              <StatCard label="QR Bancario" value={money(data.incomeByMethod.qr)} />
              {data.byInsurance.map((ins) => (
                <div key={ins.name} className="rounded-2xl border border-border bg-surface p-4">
                  <p className="flex items-center gap-1.5 text-xs text-text-muted">
                    <ShieldCheck className="size-3.5" /> {ins.name}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-text-primary">{ins.count}</p>
                  <p className="text-xs text-text-muted">
                    citas · valor ref. {money(ins.referentialValue)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Ingresos en el tiempo */}
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-text-secondary">
              Ingresos en el tiempo
            </h2>
            {data.incomeOverTime.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted">
                Sin ingresos en el período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data.incomeOverTime} margin={{ left: 8, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-token)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip
                    formatter={(v) => money(Number(v))}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid var(--border-token)',
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#inc)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </section>

          {/* Ingresos por doctor */}
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-text-secondary">Ingresos por doctor</h2>
            {data.byDoctor.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted">Sin datos en el período.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(160, data.byDoctor.length * 48)}>
                  <BarChart data={data.byDoctor} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-token)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="doctorName"
                      tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                      tickLine={false}
                      axisLine={false}
                      width={120}
                    />
                    <Tooltip
                      formatter={(v) => money(Number(v))}
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid var(--border-token)',
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="income" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Tabla de conteos por doctor */}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                        <th className="py-2 pr-3">Doctor</th>
                        <th className="py-2 px-3 text-right">Ingresos</th>
                        <th className="py-2 px-3 text-right">Compl.</th>
                        <th className="py-2 px-3 text-right">Canc.</th>
                        <th className="py-2 pl-3 text-right">No asist.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDoctor.map((d) => (
                        <tr key={d.doctorId} className="border-t border-[var(--border-hairline)]">
                          <td className="py-2 pr-3 font-medium text-text-primary">
                            {d.doctorName}
                          </td>
                          <td className="py-2 px-3 text-right text-text-secondary">
                            {money(d.income)}
                          </td>
                          <td className="py-2 px-3 text-right text-text-secondary">
                            {d.completed}
                          </td>
                          <td className="py-2 px-3 text-right text-text-secondary">
                            {d.cancelled}
                          </td>
                          <td className="py-2 pl-3 text-right text-text-secondary">{d.noShow}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-primary' : 'text-text-primary'}`}>
        {value}
      </p>
    </div>
  );
}
