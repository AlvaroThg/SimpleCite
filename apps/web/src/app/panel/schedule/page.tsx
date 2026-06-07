'use client';

import { useEffect, useState, useCallback } from 'react';
import { CalendarDays, CalendarOff, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { fmtDateTime } from '@/components/panel/ui';
import { SkeletonList } from '@/components/panel/Skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

export default function SchedulePage() {
  return (
    <PanelShell>
      <Schedule />
    </PanelShell>
  );
}

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// Orden de visualización: Lun→Dom (más natural que Dom→Sáb).
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

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
      .catch((e) =>
        toast.error(e instanceof PanelApiError ? e.message : 'Error al cargar doctores'),
      )
      .finally(() => setLoading(false));
  }, [session]);

  // Cargar reglas + bloqueos cuando cambia el doctor.
  const loadDoctorData = useCallback(async () => {
    if (!session || !doctorId) return;
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
      toast.error(e instanceof PanelApiError ? e.message : 'Error al cargar el horario');
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
        toast.error(`El día ${DAYS[bad.dayOfWeek]} tiene fin antes o igual al inicio.`);
        setSavingRules(false);
        return;
      }
      await replaceRules(session.token, session.slug, doctorId, rules);
      toast.success('Horario guardado.');
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo guardar el horario');
    } finally {
      setSavingRules(false);
    }
  }

  async function addBlock() {
    if (!session || !doctorId || !blkStart || !blkEnd) return;
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
      toast.success('Bloqueo añadido.');
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo crear el bloqueo');
    }
  }

  async function removeBlock(id: string) {
    if (!session || !confirm('¿Eliminar este bloqueo?')) return;
    try {
      await deleteBlock(session.token, session.slug, id);
      await loadDoctorData();
      toast.success('Bloqueo eliminado.');
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo eliminar el bloqueo');
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-gray-900">Horarios</h1>
        <SkeletonList rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Horarios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define la disponibilidad semanal y los bloqueos puntuales de cada doctor.
        </p>
      </div>

      {doctors.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title="Aún no hay doctores"
          description="Crea un doctor en la sección Doctores para poder configurar su horario de atención."
        />
      ) : (
        <>
          {/* Selector de doctor */}
          <div className="max-w-xs space-y-1.5">
            <Label>Doctor</Label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-input bg-white px-3 py-1 text-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {!d.isActive ? ' (archivado)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Disponibilidad semanal */}
          <Card>
            <CardHeader>
              <CardTitle>Disponibilidad semanal</CardTitle>
              <CardDescription>
                Activa los días que atiende el doctor y define el rango horario de cada uno.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {DISPLAY_ORDER.map((i) => {
                  const d = days[i];
                  return (
                    <div
                      key={i}
                      className={cn(
                        'rounded-xl border p-4 transition-all',
                        d.enabled
                          ? 'border-primary/40 bg-accent/40 shadow-sm'
                          : 'border-gray-200 bg-white opacity-90 hover:border-gray-300 hover:opacity-100',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'font-medium',
                            d.enabled ? 'text-gray-900' : 'text-gray-500',
                          )}
                        >
                          {DAYS[i]}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDay(i, { enabled: !d.enabled })}
                          aria-pressed={d.enabled}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all active:scale-95',
                            d.enabled
                              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                          )}
                        >
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              d.enabled ? 'bg-white' : 'bg-gray-400',
                            )}
                          />
                          {d.enabled ? 'Activo' : 'Inactivo'}
                        </button>
                      </div>

                      <div
                        className={cn(
                          'mt-3 flex items-center gap-2 transition-opacity',
                          d.enabled ? 'opacity-100' : 'pointer-events-none opacity-40',
                        )}
                      >
                        <Input
                          type="time"
                          value={d.start}
                          disabled={!d.enabled}
                          onChange={(e) => setDay(i, { start: e.target.value })}
                          className="h-9 bg-white"
                        />
                        <span className="text-sm text-muted-foreground">a</span>
                        <Input
                          type="time"
                          value={d.end}
                          disabled={!d.enabled}
                          onChange={(e) => setDay(i, { end: e.target.value })}
                          className="h-9 bg-white"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-1">
                <Button onClick={saveRules} disabled={savingRules}>
                  {savingRules ? 'Guardando…' : 'Guardar horario'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Bloqueos puntuales */}
          <Card>
            <CardHeader>
              <CardTitle>Bloqueos puntuales</CardTitle>
              <CardDescription>
                Vacaciones, congresos o cualquier período en el que el doctor no atiende.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">Desde</Label>
                  <Input
                    type="datetime-local"
                    value={blkStart}
                    onChange={(e) => setBlkStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">Hasta</Label>
                  <Input
                    type="datetime-local"
                    value={blkEnd}
                    onChange={(e) => setBlkEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs text-gray-600">Motivo (opcional)</Label>
                  <Input
                    value={blkReason}
                    onChange={(e) => setBlkReason(e.target.value)}
                    placeholder="Ej: Congreso médico"
                  />
                </div>
                <Button onClick={addBlock} disabled={!blkStart || !blkEnd} variant="secondary">
                  <Plus /> Añadir
                </Button>
              </div>

              {blocks.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
                  <CalendarOff className="size-6 text-gray-300" />
                  Sin bloqueos registrados.
                </div>
              ) : (
                <ul className="space-y-2">
                  {blocks.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5 transition-colors hover:border-gray-200 hover:bg-gray-50"
                    >
                      <div className="min-w-0 text-sm">
                        <p className="text-gray-900">
                          {fmtDateTime(b.startTime)} → {fmtDateTime(b.endTime)}
                        </p>
                        {b.reason && <p className="truncate text-gray-400">{b.reason}</p>}
                      </div>
                      <button
                        onClick={() => removeBlock(b.id)}
                        className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="size-4" /> Eliminar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
