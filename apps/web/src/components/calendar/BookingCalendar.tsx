'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, Views, type View } from 'react-big-calendar';
import { format } from 'date-fns';
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
  /** Al navegar a otra semana/día → cargar la disponibilidad de ese rango. */
  onRangeChange?: (from: Date, to: Date) => void;
  defaultView?: View;
  minHour?: number;
  maxHour?: number;
}

type CalEvent = { start: Date; end: Date; title: string; available: boolean };

/** Contenido compacto del bloque: la hora de inicio (legible, sin truncar). */
function SlotEvent({ event }: { event: CalEvent }) {
  return (
    <div className="truncate text-[11px] font-semibold leading-tight">
      {event.available ? format(event.start, 'HH:mm') : 'Ocupado'}
    </div>
  );
}

/**
 * Calendario público de reservas (estilo Google Calendar). El paciente ve los
 * turnos DISPONIBLES como bloques verdes clicables y los OCUPADOS en gris (sin
 * nombres). En móvil arranca en vista Día; en escritorio, Semana.
 */
export function BookingCalendar({
  slots,
  onPick,
  onRangeChange,
  defaultView = Views.WEEK,
  minHour = 7,
  maxHour = 20,
}: BookingCalendarProps) {
  const [view, setView] = useState<View>(defaultView);
  const [date, setDate] = useState<Date>(new Date());

  // Responsive: en pantallas chicas, vista Día (como Google Calendar móvil).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches) {
      setView(Views.DAY);
    }
  }, []);

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
  // Scroll inicial a la primera hora con cupo (o al inicio de la franja).
  const scrollToTime = useMemo(() => {
    const d = new Date();
    d.setHours(firstAvailable ? firstAvailable.getHours() : minHour, 0, 0, 0);
    return d;
  }, [firstAvailable, minHour]);

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

      <div className="sc-calendar h-[600px] rounded-2xl border border-gray-100 bg-white p-2 sm:h-[720px] sm:p-3">
        <Calendar<CalEvent>
          localizer={localizer}
          culture="es"
          messages={messagesEs}
          formats={formatsEs}
          components={{ event: SlotEvent }}
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
          onRangeChange={(range) => {
            if (!onRangeChange) return;
            const dates = Array.isArray(range)
              ? (range as Date[])
              : [(range as { start: Date }).start, (range as { end: Date }).end];
            if (!dates.length) return;
            const from = new Date(dates[0]);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dates[dates.length - 1]);
            to.setHours(23, 59, 59, 0);
            onRangeChange(from, to);
          }}
          min={min}
          max={max}
          step={30}
          timeslots={1}
          scrollToTime={scrollToTime}
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
