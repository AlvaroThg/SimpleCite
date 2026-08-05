'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, Sparkles, Stethoscope } from 'lucide-react';
import { useAuth } from '@/lib/panel-auth';
import {
  getPatientHistory,
  getDoctorsAdmin,
  PanelApiError,
  type PatientHistory,
  type Doctor,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import {
  BackLink,
  StatusBadge,
  fmtDate,
  fmtTime,
  fmtDateTime,
  ErrorBox,
} from '@/components/panel/ui';
import { SkeletonDetail } from '@/components/panel/Skeleton';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/panel/Markdown';

export default function PatientHistoryPage() {
  return (
    <PanelShell>
      <PatientHistoryView />
    </PanelShell>
  );
}

function PatientHistoryView() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const [data, setData] = useState<PatientHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Filtro de citas por doctor + citas extra cargadas con "Ver más".
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorFilter, setDoctorFilter] = useState('');
  const [moreAppts, setMoreAppts] = useState<PatientHistory['appointments']['items']>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    setMoreAppts([]);
    try {
      const h = await getPatientHistory(session.token, session.slug, id, {
        doctorId: doctorFilter || undefined,
      });
      setData(h);
      setNextCursor(h.appointments.nextCursor);
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'Error al cargar el historial');
    } finally {
      setLoading(false);
    }
  }, [session, id, doctorFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Doctores para el selector de filtro (lista visible a cualquier rol).
  useEffect(() => {
    if (!session) return;
    getDoctorsAdmin(session.token, session.slug)
      .then(setDoctors)
      .catch(() => {});
  }, [session]);

  async function loadMore() {
    if (!session || !nextCursor) return;
    setLoadingMore(true);
    try {
      const h = await getPatientHistory(session.token, session.slug, id, {
        doctorId: doctorFilter || undefined,
        cursor: nextCursor,
      });
      setMoreAppts((prev) => [...prev, ...h.appointments.items]);
      setNextCursor(h.appointments.nextCursor);
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo cargar más');
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) return <SkeletonDetail />;
  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return null;

  const canWrite = session?.user.role === 'ADMIN' || session?.user.role === 'DOCTOR';
  const allAppts = [...data.appointments.items, ...moreAppts];
  // Cita a la que apunta el botón de consulta: la próxima confirmada; si no
  // hay ninguna futura, la última ya atendida (para revisar lo registrado).
  const activeAppt =
    allAppts.find((a) => a.status === 'CONFIRMED' && new Date(a.startTime) >= new Date()) ??
    allAppts.find((a) => a.status === 'COMPLETED');

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Cabecera del paciente */}
      <div className="bg-surface rounded-2xl border border-border p-6">
        <h1 className="text-xl font-bold text-text-primary">{data.patient.name}</h1>
        <p className="text-sm text-text-muted">
          {data.patient.phone ?? (data.patient.ci ? `CI ${data.patient.ci}` : '—')}
        </p>
        {data.patient.ci && <p className="text-sm text-text-muted">CI: {data.patient.ci}</p>}
      </div>

      {/* La ficha del paciente es su HISTORIA: se lee, no se edita. Lo que se
          escribe (síntomas, diagnóstico, tratamiento, notas) vive dentro de la
          consulta de una cita concreta, para que quede atado a su atención.
          Antes había un compositor suelto aquí que competía con ese registro. */}
      {canWrite && data.clinicalAccess && activeAppt && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              {activeAppt.status === 'COMPLETED' ? 'Última consulta' : 'Próxima cita'}
            </p>
            <p className="truncate text-sm text-text-muted">
              {activeAppt.service.name} · {fmtDateTime(activeAppt.startTime)}
            </p>
          </div>
          <Button asChild className="h-10">
            <Link href={`/panel/appointments/${activeAppt.id}/consulta`}>
              <Stethoscope className="size-4" />
              {activeAppt.status === 'COMPLETED' ? 'Ver consulta' : 'Iniciar consulta'}
            </Link>
          </Button>
        </div>
      )}

      {/* Historia clínica: notas registradas en consultas anteriores. */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Historia clínica</h2>
        {!data.clinicalAccess ? (
          <div className="flex items-center justify-center gap-2 bg-canvas border border-border rounded-xl px-4 py-6 text-center text-sm text-text-muted">
            <Lock className="size-4 flex-shrink-0" /> No tienes acceso al contenido clínico de este
            paciente.
          </div>
        ) : data.notes.length === 0 ? (
          <p className="text-text-muted text-sm">
            Aún no hay registros. Se van creando al atender cada cita desde{' '}
            <span className="font-medium text-text-secondary">Iniciar consulta</span>.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.notes.map((n) => (
              <li key={n.id} className="bg-surface rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-2 text-xs text-text-muted">
                  <span className="font-medium text-text-secondary">{n.doctor.name}</span>
                  <span>{fmtDateTime(n.createdAt)}</span>
                </div>
                <Markdown content={n.content} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Historial de citas — todas las del paciente, con filtro por doctor */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-secondary">Citas</h2>
          {doctors.length > 0 && (
            <select
              value={doctorFilter}
              onChange={(e) => setDoctorFilter(e.target.value)}
              className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="">Todos los doctores</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {allAppts.length === 0 ? (
          <p className="text-text-muted text-sm">
            {doctorFilter ? 'Sin citas con este doctor.' : 'Sin citas registradas.'}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {allAppts.map((a) => {
                const durMin = Math.round(
                  (new Date(a.endTime).getTime() - new Date(a.startTime).getTime()) / 60000,
                );
                return (
                  <li key={a.id}>
                    <Link
                      href={`/panel/appointments/${a.id}`}
                      className="block bg-surface rounded-xl border border-border p-3 hover:border-brand-300 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="truncate text-sm font-medium text-text-primary">
                              {a.service.name}
                              <span className="font-normal text-text-muted">
                                {' '}
                                · {a.doctor.name}
                              </span>
                            </p>
                            {a.medicalRecord?.isNewTreatment && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--st-tent-bd)] bg-[var(--st-tent-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--st-tent-tx)]">
                                <Sparkles className="size-3" />
                                {a.medicalRecord.treatmentLabel || 'Nuevo tratamiento'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-muted">
                            {fmtDate(a.startTime)} · {fmtTime(a.startTime)}–{fmtTime(a.endTime)} ·{' '}
                            {durMin} min
                          </p>
                        </div>
                        <StatusBadge status={a.status} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {nextCursor && (
              <div className="mt-3 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-lg border border-border px-4 py-1.5 text-sm text-text-secondary transition-colors hover:bg-canvas disabled:opacity-50"
                >
                  {loadingMore ? 'Cargando…' : 'Ver más citas'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
