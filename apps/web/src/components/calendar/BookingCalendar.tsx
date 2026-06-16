'use client';

import { useMemo, useState } from 'react';
import { Calendar, Views, type View, type SlotInfo } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './calendar.css';
import { localizer, messagesEs, formatsEs } from './localizer';

/** Bloque ocupado tal como lo ve el paciente: sin datos del paciente real. */
export interface BusyBlock {
  start: Date;
  end: Date;
}

interface BookingCalendarProps {
  /** Franjas ya ocupadas (anonimizadas). Vienen del backend público de slots. */
  busy: BusyBlock[];
  /** Se dispara al hacer clic en un hueco libre → abre el flujo de reserva. */
  onPickSlot: (slot: { start: Date; end: Date }) => void;
  /** Vista inicial. Por defecto, semana. */
  defaultView?: View;
  /** Horas visibles del día (por defecto 7:00–20:00). */
  minHour?: number;
  maxHour?: number;
}

type CalEvent = BusyBlock & { title: string };

/**
 * Calendario público de reservas. Los pacientes ven solo bloques "Ocupado"
 * (sin nombres) y pueden tocar un espacio vacío para iniciar una reserva.
 */
export function BookingCalendar({
  busy,
  onPickSlot,
  defaultView = Views.WEEK,
  minHour = 7,
  maxHour = 20,
}: BookingCalendarProps) {
  const [view, setView] = useState<View>(defaultView);
  const [date, setDate] = useState<Date>(new Date());

  const events = useMemo<CalEvent[]>(() => busy.map((b) => ({ ...b, title: 'Ocupado' })), [busy]);

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

  function handleSelectSlot(slot: SlotInfo) {
    // Ignorar selecciones que se solapan con un bloque ocupado.
    const overlaps = busy.some((b) => slot.start < b.end && slot.end > b.start);
    if (overlaps) return;
    onPickSlot({ start: slot.start, end: slot.end });
  }

  return (
    <div className="sc-calendar sc-selectable h-[600px] rounded-2xl border border-gray-100 bg-white p-3">
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
        views={[Views.MONTH, Views.WEEK, Views.DAY]}
        selectable
        onSelectSlot={handleSelectSlot}
        // El paciente no puede interactuar con un bloque ocupado.
        onSelectEvent={() => undefined}
        min={min}
        max={max}
        step={30}
        timeslots={2}
        popup
        eventPropGetter={() => ({ className: 'sc-busy' })}
        dayLayoutAlgorithm="no-overlap"
      />
    </div>
  );
}
