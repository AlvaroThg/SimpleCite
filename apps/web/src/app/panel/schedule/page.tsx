'use client';

import { useEffect, useState, useCallback } from 'react';
import { CalendarDays, CalendarOff, Coffee, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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

/**
 * Estado por día: habilitado + una o más franjas HH:MM. Varias franjas
 * representan cortes intermedios (ej. 09:00–12:00 + 15:00–19:00 = almuerzo).
 */
type Range = { start: string; end: string };
type DayState = { enabled: boolean; ranges: Range[] };
const defaultDay = (): DayState => ({ enabled: false, ranges: [{ start: '09:00', end: '17:00' }] });

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

  // Bloqueo nuevo (fecha + hora separadas para mejor UX)
  const [blkStartDate, setBlkStartDate] = useState('');
  const [blkStartTime, setBlkStartTime] = useState('09:00');
  const [blkEndDate, setBlkEndDate] = useState('');
  const [blkEndTime, setBlkEndTime] = useState('17:00');
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
      // Agrupar reglas por día → varias franjas por día (ya vienen ordenadas).
      const byDay: Record<number, Range[]> = {};
      for (const r of rules) {
        (byDay[r.dayOfWeek] ??= []).push({
          start: toHHMM(r.startMinute),
          end: toHHMM(r.endMinute),
        });
      }
      for (let i = 0; i < 7; i++) {
        if (byDay[i]?.length) next[i] = { enabled: true, ranges: byDay[i] };
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
  function setRange(i: number, r: number, patch: Partial<Range>) {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === i
          ? { ...d, ranges: d.ranges.map((rg, ri) => (ri === r ? { ...rg, ...patch } : rg)) }
          : d,
      ),
    );
  }
  function addRange(i: number) {
    setDays((prev) =>
      prev.map((d, idx) => {
        if (idx !== i) return d;
        // Nueva franja por defecto: arranca 1h después del fin de la última.
        const last = d.ranges[d.ranges.length - 1];
        const startMin = Math.min(toMin(last?.end ?? '13:00') + 60, 1380);
        return {
          ...d,
          ranges: [
            ...d.ranges,
            { start: toHHMM(startMin), end: toHHMM(Math.min(startMin + 180, 1439)) },
          ],
        };
      }),
    );
  }
  function removeRange(i: number, r: number) {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === i ? { ...d, ranges: d.ranges.filter((_, ri) => ri !== r) } : d,
      ),
    );
  }

  async function saveRules() {
    if (!session || !doctorId) return;
    setSavingRules(true);
    try {
      const rules = days.flatMap((d, i) =>
        d.enabled
          ? d.ranges.map((r) => ({
              dayOfWeek: i,
              startMinute: toMin(r.start),
              endMinute: toMin(r.end),
            }))
          : [],
      );
      // Validación local: cada franja fin > inicio.
      const bad = rules.find((r) => r.endMinute <= r.startMinute);
      if (bad) {
        toast.error(`El día ${DAYS[bad.dayOfWeek]} tiene una franja con fin ≤ inicio.`);
        setSavingRules(false);
        return;
      }
      // Validación local: franjas del mismo día no se solapan (el backend también
      // lo valida, pero avisamos antes con un mensaje claro).
      for (let i = 0; i < 7; i++) {
        const dayRanges = rules
          .filter((r) => r.dayOfWeek === i)
          .sort((a, b) => a.startMinute - b.startMinute);
        for (let k = 1; k < dayRanges.length; k++) {
          if (dayRanges[k].startMinute < dayRanges[k - 1].endMinute) {
            toast.error(`El día ${DAYS[i]} tiene franjas que se solapan.`);
            setSavingRules(false);
            return;
          }
        }
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
    if (!session || !doctorId || !blkStartDate || !blkEndDate) return;
    const startIso = new Date(`${blkStartDate}T${blkStartTime || '00:00'}`).toISOString();
    const endIso = new Date(`${blkEndDate}T${blkEndTime || '23:59'}`).toISOString();
    if (new Date(endIso) <= new Date(startIso)) {
      toast.error('El fin del bloqueo debe ser posterior al inicio.');
      return;
    }
    try {
      await createBlock(session.token, session.slug, doctorId, {
        startTime: startIso,
        endTime: endIso,
        reason: blkReason.trim() || undefined,
      });
      setBlkStartDate('');
      setBlkEndDate('');
      setBlkReason('');
      await loadDoctorData();
      toast.success('Bloqueo añadido.');
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo crear el bloqueo');
    }
  }

  // Bloqueo pendiente de eliminación (abre el modal de confirmación).
  const [blockToDelete, setBlockToDelete] = useState<string | null>(null);
  const [deletingBlock, setDeletingBlock] = useState(false);

  async function removeBlock(id: string) {
    if (!session) return;
    setDeletingBlock(true);
    try {
      await deleteBlock(session.token, session.slug, id);
      setBlockToDelete(null);
      await loadDoctorData();
      toast.success('Bloqueo eliminado.');
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo eliminar el bloqueo');
    } finally {
      setDeletingBlock(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-text-primary">Horarios</h1>
        <SkeletonList rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Horarios</h1>
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
              className="flex h-9 w-full rounded-lg border border-input bg-surface px-3 py-1 text-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
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
                Activa los días que atiende el doctor y define sus franjas. Usa “Añadir franja” para
                un corte a media jornada (ej. almuerzo): 09:00–12:00 y 15:00–19:00.
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
                          : 'border-border bg-surface opacity-90 hover:border-border-strong hover:opacity-100',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'font-medium',
                            d.enabled ? 'text-text-primary' : 'text-text-muted',
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
                              : 'bg-muted text-text-muted hover:bg-muted',
                          )}
                        >
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              d.enabled ? 'bg-surface' : 'bg-text-muted',
                            )}
                          />
                          {d.enabled ? 'Activo' : 'Inactivo'}
                        </button>
                      </div>

                      <div
                        className={cn(
                          'mt-3 space-y-2 transition-opacity',
                          d.enabled ? 'opacity-100' : 'pointer-events-none opacity-40',
                        )}
                      >
                        {d.ranges.map((rg, ri) => (
                          <div key={ri}>
                            <div className="flex items-center gap-2">
                              <Input
                                type="time"
                                value={rg.start}
                                disabled={!d.enabled}
                                onChange={(e) => setRange(i, ri, { start: e.target.value })}
                                className="h-9 bg-surface"
                              />
                              <span className="text-sm text-muted-foreground">a</span>
                              <Input
                                type="time"
                                value={rg.end}
                                disabled={!d.enabled}
                                onChange={(e) => setRange(i, ri, { end: e.target.value })}
                                className="h-9 bg-surface"
                              />
                              {d.ranges.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeRange(i, ri)}
                                  aria-label="Quitar franja"
                                  className="flex-shrink-0 rounded-lg p-2 text-text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              )}
                            </div>
                            {/* Descanso: hueco entre esta franja y la siguiente. */}
                            {ri < d.ranges.length - 1 &&
                              toMin(d.ranges[ri + 1].start) > toMin(rg.end) && (
                                <div className="my-1 flex items-center gap-1.5 pl-1 text-xs font-medium text-text-muted">
                                  <Coffee className="size-3.5" />
                                  Descanso {rg.end}–{d.ranges[ri + 1].start}
                                </div>
                              )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addRange(i)}
                          disabled={!d.enabled}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent disabled:opacity-50"
                        >
                          <Plus className="size-3.5" /> Añadir franja
                        </button>
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-text-secondary">Desde</Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={blkStartDate}
                      onChange={(e) => setBlkStartDate(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="time"
                      value={blkStartTime}
                      onChange={(e) => setBlkStartTime(e.target.value)}
                      className="w-28"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-text-secondary">Hasta</Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={blkEndDate}
                      onChange={(e) => setBlkEndDate(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="time"
                      value={blkEndTime}
                      onChange={(e) => setBlkEndTime(e.target.value)}
                      className="w-28"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs text-text-secondary">Motivo (opcional)</Label>
                  <Input
                    value={blkReason}
                    onChange={(e) => setBlkReason(e.target.value)}
                    placeholder="Ej: Congreso médico"
                  />
                </div>
                <Button
                  onClick={addBlock}
                  disabled={!blkStartDate || !blkEndDate}
                  variant="secondary"
                >
                  <Plus /> Añadir
                </Button>
              </div>

              {blocks.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center text-sm text-text-muted">
                  <CalendarOff className="size-6 text-text-disabled" />
                  Sin bloqueos registrados.
                </div>
              ) : (
                <ul className="space-y-2">
                  {blocks.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:border-border hover:bg-canvas"
                    >
                      <div className="min-w-0 text-sm">
                        <p className="text-text-primary">
                          {fmtDateTime(b.startTime)} → {fmtDateTime(b.endTime)}
                        </p>
                        {b.reason && <p className="truncate text-text-muted">{b.reason}</p>}
                      </div>
                      <button
                        onClick={() => setBlockToDelete(b.id)}
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
      {/* Confirmación de eliminación de bloqueo */}
      <ConfirmDialog
        open={!!blockToDelete}
        title="¿Eliminar este bloqueo?"
        description="El horario bloqueado volverá a estar disponible para reservas."
        confirmLabel="Eliminar"
        variant="danger"
        loading={deletingBlock}
        onConfirm={() => blockToDelete && removeBlock(blockToDelete)}
        onCancel={() => setBlockToDelete(null)}
      />
    </div>
  );
}
