'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/panel-auth';
import {
  getDoctorsAdmin,
  getRules,
  replaceRules,
  getBlocks,
  createBlock,
  deleteBlock,
  PanelApiError,
  type Doctor,
  type ScheduleBlock,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { ErrorBox, fmtDateTime } from '@/components/panel/ui';
import { SkeletonList } from '@/components/panel/Skeleton';

export default function SchedulePage() {
  return (
    <PanelShell>
      <Schedule />
    </PanelShell>
  );
}

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Estado por día: habilitado + rango HH:MM. Una franja por día (lo común). */
type DayState = { enabled: boolean; start: string; end: string };
const defaultDay = (): DayState => ({ enabled: false, start: '09:00', end: '17:00' });

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function Schedule() {
  const { session } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [days, setDays] = useState<DayState[]>(() => Array.from({ length: 7 }, defaultDay));
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  // Bloqueo nuevo
  const [blkStart, setBlkStart] = useState('');
  const [blkEnd, setBlkEnd] = useState('');
  const [blkReason, setBlkReason] = useState('');

  // Cargar doctores al montar.
  useEffect(() => {
    if (!session) return;
    getDoctorsAdmin(session.token, session.slug)
      .then((d) => {
        setDoctors(d);
        if (d.length) setDoctorId((prev) => prev || d[0].id);
      })
      .catch((e) => setError(e instanceof PanelApiError ? e.message : 'Error al cargar doctores'))
      .finally(() => setLoading(false));
  }, [session]);

  // Cargar reglas + bloqueos cuando cambia el doctor.
  const loadDoctorData = useCallback(async () => {
    if (!session || !doctorId) return;
    setError('');
    try {
      const [rules, blks] = await Promise.all([
        getRules(session.token, session.slug, doctorId),
        getBlocks(session.token, session.slug, doctorId),
      ]);
      const next = Array.from({ length: 7 }, defaultDay);
      for (const r of rules) {
        next[r.dayOfWeek] = {
          enabled: true,
          start: toHHMM(r.startMinute),
          end: toHHMM(r.endMinute),
        };
      }
      setDays(next);
      setBlocks(blks);
    } catch (e) {
      setError(e instanceof PanelApiError ? e.message : 'Error al cargar el horario');
    }
  }, [session, doctorId]);

  useEffect(() => {
    void loadDoctorData();
  }, [loadDoctorData]);

  function setDay(i: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function saveRules() {
    if (!session || !doctorId) return;
    setSavingRules(true);
    setError('');
    setOk('');
    try {
      const rules = days
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => d.enabled)
        .map(({ d, i }) => ({
          dayOfWeek: i,
          startMinute: toMin(d.start),
          endMinute: toMin(d.end),
        }));
      // Validación local: end > start.
      const bad = rules.find((r) => r.endMinute <= r.startMinute);
      if (bad) {
        setError(`El día ${DAYS[bad.dayOfWeek]} tiene fin antes o igual al inicio.`);
        setSavingRules(false);
        return;
      }
      await replaceRules(session.token, session.slug, doctorId, rules);
      setOk('Horario guardado.');
    } catch (e) {
      setError(e instanceof PanelApiError ? e.message : 'No se pudo guardar el horario');
    } finally {
      setSavingRules(false);
    }
  }

  async function addBlock() {
    if (!session || !doctorId || !blkStart || !blkEnd) return;
    setError('');
    try {
      await createBlock(session.token, session.slug, doctorId, {
        startTime: new Date(blkStart).toISOString(),
        endTime: new Date(blkEnd).toISOString(),
        reason: blkReason.trim() || undefined,
      });
      setBlkStart('');
      setBlkEnd('');
      setBlkReason('');
      await loadDoctorData();
    } catch (e) {
      setError(e instanceof PanelApiError ? e.message : 'No se pudo crear el bloqueo');
    }
  }

  async function removeBlock(id: string) {
    if (!session || !confirm('¿Eliminar este bloqueo?')) return;
    try {
      await deleteBlock(session.token, session.slug, id);
      await loadDoctorData();
    } catch (e) {
      setError(e instanceof PanelApiError ? e.message : 'No se pudo eliminar el bloqueo');
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-gray-900">Horarios</h1>
        <SkeletonList rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Horarios</h1>

      {error && <ErrorBox message={error} />}
      {ok && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          {ok}
        </div>
      )}

      {doctors.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          No hay doctores. Crea uno en la sección Doctores.
        </p>
      ) : (
        <>
          <label className="block space-y-1 max-w-xs">
            <span className="text-sm font-medium text-gray-700">Doctor</span>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {!d.isActive ? ' (archivado)' : ''}
                </option>
              ))}
            </select>
          </label>

          {/* Reglas semanales */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-700">Disponibilidad semanal</p>
            {days.map((d, i) => (
              <div key={i} className="flex items-center gap-3 py-1">
                <label className="flex items-center gap-2 w-32 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    onChange={(e) => setDay(i, { enabled: e.target.checked })}
                  />
                  <span className={`text-sm ${d.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                    {DAYS[i]}
                  </span>
                </label>
                <input
                  type="time"
                  value={d.start}
                  disabled={!d.enabled}
                  onChange={(e) => setDay(i, { start: e.target.value })}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-300"
                />
                <span className="text-gray-400 text-sm">a</span>
                <input
                  type="time"
                  value={d.end}
                  disabled={!d.enabled}
                  onChange={(e) => setDay(i, { end: e.target.value })}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-300"
                />
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <button
                onClick={saveRules}
                disabled={savingRules}
                className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {savingRules ? 'Guardando…' : 'Guardar horario'}
              </button>
            </div>
          </div>

          {/* Bloqueos */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Bloqueos puntuales</p>
            <p className="text-xs text-gray-400">
              Vacaciones, congresos o cualquier período en el que no atiendes.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-gray-600">Desde</span>
                <input
                  type="datetime-local"
                  value={blkStart}
                  onChange={(e) => setBlkStart(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-gray-600">Hasta</span>
                <input
                  type="datetime-local"
                  value={blkEnd}
                  onChange={(e) => setBlkEnd(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex gap-2 items-end">
              <label className="block space-y-1 flex-1">
                <span className="text-xs font-medium text-gray-600">Motivo (opcional)</span>
                <input
                  value={blkReason}
                  onChange={(e) => setBlkReason(e.target.value)}
                  placeholder="Ej: Congreso médico"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <button
                onClick={addBlock}
                disabled={!blkStart || !blkEnd}
                className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
              >
                Añadir
              </button>
            </div>

            {blocks.length > 0 && (
              <ul className="space-y-2 pt-2">
                {blocks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl px-3 py-2"
                  >
                    <div className="min-w-0 text-sm">
                      <p className="text-gray-900">
                        {fmtDateTime(b.startTime)} → {fmtDateTime(b.endTime)}
                      </p>
                      {b.reason && <p className="text-gray-400 truncate">{b.reason}</p>}
                    </div>
                    <button
                      onClick={() => removeBlock(b.id)}
                      className="text-red-500 hover:text-red-700 text-sm flex-shrink-0"
                    >
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
