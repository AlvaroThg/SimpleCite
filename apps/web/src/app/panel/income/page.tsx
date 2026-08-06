'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/panel-auth';
import {
  getIncome,
  getDoctorsAdmin,
  getServices,
  getPatients,
  PanelApiError,
  type IncomeRow,
  type Doctor,
  type ServiceItem,
  type PatientListItem,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { ErrorBox } from '@/components/panel/ui';
import { SkeletonCards } from '@/components/panel/Skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Banknote, QrCode, ShieldCheck, Search, Wallet } from 'lucide-react';

export default function IncomePage() {
  return (
    <PanelShell>
      <Income />
    </PanelShell>
  );
}

/** Primer y último día del mes actual, en formato de <input type="date">. */
function currentMonth(): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}` };
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  STATIC_QR: 'QR',
  INSURANCE: 'Seguro',
};

const money = (n: number) => `Bs ${n.toLocaleString('es-BO', { minimumFractionDigits: 0 })}`;

/**
 * Libro de ingresos.
 *
 * Replica la libreta que la clínica lleva a mano: día por día, con la lista de
 * pacientes cobrados y el total de la jornada al costado. Esa forma importa —
 * es la que el dueño ya sabe leer y con la que verifica la caja. El análisis
 * agregado (gráficos, comparativas) vive en Reportes.
 */
function Income() {
  const { session } = useAuth();
  const [range, setRange] = useState(currentMonth);
  const [rows, setRows] = useState<IncomeRow[]>([]);
  const [timezone, setTimezone] = useState('America/La_Paz');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros: los tres que la clínica pidió (paciente, día y servicio) más
  // doctor, que sale gratis y es la pregunta más frecuente del administrador.
  const [doctorId, setDoctorId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [patientQuery, setPatientQuery] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [patients, setPatients] = useState<PatientListItem[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const data = await getIncome(session.token, session.slug, {
        from: `${range.from}T00:00:00.000Z`,
        to: `${range.to}T23:59:59.999Z`,
        doctorId: doctorId || undefined,
        serviceId: serviceId || undefined,
      });
      setRows(data.items);
      setTimezone(data.timezone);
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudieron cargar los ingresos');
    } finally {
      setLoading(false);
    }
  }, [session, range, doctorId, serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Catálogos de los filtros. El de pacientes se filtra en cliente: la lista
  // ya está cargada y así escribir el nombre responde al instante.
  useEffect(() => {
    if (!session) return;
    void Promise.all([
      getDoctorsAdmin(session.token, session.slug).catch(() => []),
      getServices(session.token, session.slug).catch(() => []),
      getPatients(session.token, session.slug, { limit: 200 })
        .then((p) => p.items)
        .catch(() => []),
    ]).then(([d, s, p]) => {
      setDoctors(d);
      setServices(s);
      setPatients(p);
    });
  }, [session]);

  const q = patientQuery.trim().toLowerCase();
  const visible = q ? rows.filter((r) => r.patient.name.toLowerCase().includes(q)) : rows;

  // Agrupado por día EN LA ZONA DE LA CLÍNICA: agrupar en UTC parte el día a
  // las 20:00 hora local y descuadraría los totales.
  const byDay = new Map<string, IncomeRow[]>();
  for (const r of visible) {
    const key = new Date(r.startTime).toLocaleDateString('es-BO', { timeZone: timezone });
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }
  const days = [...byDay.entries()].sort(
    (a, b) => new Date(b[1][0].startTime).getTime() - new Date(a[1][0].startTime).getTime(),
  );
  const total = visible.reduce((acc, r) => acc + r.amount, 0);

  const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString('es-BO', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Ingresos</h1>
          <p className="mt-1 text-sm text-text-muted">
            Lo cobrado día por día, con el detalle de cada cita.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-text-muted">
            Desde
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="mt-1 block rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <label className="text-xs text-text-muted">
            Hasta
            <input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="mt-1 block rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
        </div>
      </div>

      {/* Total del período: la cifra que se busca primero. */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Total del período
        </p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums text-text-primary">
          {money(total)}
        </p>
        <p className="mt-1 text-sm text-text-muted">
          {visible.length} {visible.length === 1 ? 'cobro' : 'cobros'} registrados
        </p>
      </div>

      {/* Filtros */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={patientQuery}
            onChange={(e) => setPatientQuery(e.target.value)}
            placeholder="Buscar paciente…"
            aria-label="Buscar paciente"
            list="income-patients"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <datalist id="income-patients">
            {patients.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </div>
        <select
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          aria-label="Filtrar por especialista"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos los especialistas</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          aria-label="Filtrar por servicio"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos los servicios</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error && <ErrorBox message={error} />}

      {loading ? (
        <SkeletonCards count={3} />
      ) : days.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-6" />}
          title="Sin cobros en este período"
          description="Cuando registres el pago de una cita, aparecerá aquí con su monto y forma de pago."
        />
      ) : (
        <div className="space-y-4">
          {days.map(([key, items]) => {
            const dayTotal = items.reduce((acc, r) => acc + r.amount, 0);
            return (
              <section
                key={key}
                className="overflow-hidden rounded-2xl border border-border bg-surface"
              >
                {/* Cabecera del día con su total, como la columna de la derecha
                    de la libreta: el número que se verifica contra la caja. */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold capitalize text-text-primary">
                    {dayLabel(items[0].startTime)}
                  </p>
                  <p className="text-sm font-bold tabular-nums text-text-primary">
                    {money(dayTotal)}
                  </p>
                </div>

                <ul className="divide-y divide-border">
                  {items.map((r, i) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-5 shrink-0 text-xs tabular-nums text-text-muted">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className="truncate text-sm font-medium text-text-primary">
                            {r.patient.name}
                          </span>
                          {r.cancelled && (
                            <span className="rounded-full bg-amber-50 px-2 py-px text-[11px] font-medium text-amber-800">
                              {r.refundResolution === 'REFUNDED'
                                ? 'devuelto'
                                : r.refundResolution === 'CREDITED'
                                  ? 'saldo a favor'
                                  : 'cancelada · por resolver'}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {r.service.name} · {r.doctor.name}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-text-muted">
                        {r.paymentMethod === 'CASH' ? (
                          <Banknote className="size-3.5" />
                        ) : r.paymentMethod === 'STATIC_QR' ? (
                          <QrCode className="size-3.5" />
                        ) : (
                          <ShieldCheck className="size-3.5" />
                        )}
                        {METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod}
                      </span>
                      <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-text-primary">
                        {money(r.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
