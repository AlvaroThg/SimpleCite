'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, Views, type View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './calendar.css';
import { localizer, messagesEs, formatsEs } from './localizer';

/** Turno tal como lo ve el paciente: con su estado de disponibilidad (sin datos de quién reservó). */
export interface CalendarSlot {
  start: Date;
  end: Date;
  available: boolean;
}

interface BookingCalendarProps {
  /** Todos los turnos de la franja visible (disponibles y ocupados). */
  slots: CalendarSlot[];
  /** Se dispara al tocar un turno DISPONIBLE → continúa la reserva. */
  onPick: (slot: { start: Date; end: Date }) => void;
  defaultView?: View;
  minHour?: number;
  maxHour?: number;
}

type CalEvent = { start: Date; end: Date; title: string; available: boolean };

/**
 * Calendario público de reservas (estilo Google Calendar). El paciente ve los
 * turnos DISPONIBLES como bloques verdes clicables y los OCUPADOS en gris (sin
 * nombres). Tocar un bloque verde inicia la reserva de ese horario.
 */
export function BookingCalendar({
  slots,
  onPick,
  defaultView = Views.WEEK,
  minHour = 7,
  maxHour = 20,
}: BookingCalendarProps) {
  const [view, setView] = useState<View>(defaultView);
  const [date, setDate] = useState<Date>(new Date());

  const events = useMemo<CalEvent[]>(
    () =>
      slots.map((s) => ({
        start: s.start,
        end: s.end,
        available: s.available,
        title: s.available ? 'Disponible' : 'Ocupado',
      })),
    [slots],
  );

  // Aterrizar en el primer día con cupo (no en una semana vacía).
  const firstAvailable = useMemo(() => slots.find((s) => s.available)?.start, [slots]);
  useEffect(() => {
    if (firstAvailable) setDate(firstAvailable);
  }, [firstAvailable]);

  const min = useMemo(() => {
    const d = new Date();
    d.setHours(minHour, 0, 0, 0);
    return d;
  }, [minHour]);
  const max = useMemo(() => {
    const d = new Date();
    d.setHours(maxHour, 0, 0, 0);
    return d;
  }, [maxHour]);

  return (
    <div>
      {/* Leyenda */}
      <div className="mb-2 flex items-center gap-4 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded bg-green-600" /> Disponible (tocá para reservar)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded bg-slate-200" /> Ocupado
        </span>
      </div>

      <div className="sc-calendar h-[560px] rounded-2xl border border-gray-100 bg-white p-3">
        <Calendar<CalEvent>
          localizer={localizer}
          culture="es"
          messages={messagesEs}
          formats={formatsEs}
          events={events}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={[Views.WEEK, Views.DAY]}
          // Solo los turnos disponibles son accionables.
          onSelectEvent={(e) => {
            if (e.available) onPick({ start: e.start, end: e.end });
          }}
          min={min}
          max={max}
          step={30}
          timeslots={2}
          popup
          eventPropGetter={(e) => ({
            className: e.available ? 'sc-slot-free' : 'sc-busy',
          })}
          dayLayoutAlgorithm="no-overlap"
        />
      </div>
    </div>
  );
}
