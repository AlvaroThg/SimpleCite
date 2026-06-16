'use client';

import { useMemo, useState } from 'react';
import { Calendar, Views, type View } from 'react-big-calendar';
import withDragAndDrop, {
  type withDragAndDropProps,
} from 'react-big-calendar/lib/addons/dragAndDrop';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import './calendar.css';
import { localizer, messagesEs, formatsEs } from './localizer';

/** Cita tal como la ve el doctor: con nombre del paciente y estado. */
export interface AdminEvent {
  id: string;
  title: string; // nombre del paciente
  start: Date;
  end: Date;
  status: string;
  doctorName?: string;
  serviceName?: string;
}

interface AdminCalendarProps {
  events: AdminEvent[];
  /** Reprogramación por drag&drop o resize → persistir en el backend. */
  onReschedule: (args: { id: string; start: Date; end: Date }) => void;
  /** Clic en una cita → abrir su detalle. */
  onSelectEvent?: (event: AdminEvent) => void;
  /** Clic/arrastre sobre un hueco vacío → crear cita a esa hora (Google Calendar). */
  onSelectSlot?: (slot: { start: Date; end: Date }) => void;
  defaultView?: View;
  minHour?: number;
  maxHour?: number;
}

const DnDCalendar = withDragAndDrop<AdminEvent>(Calendar);

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Calendario del panel. El doctor ve el nombre del paciente y puede arrastrar
 * (o redimensionar) una cita para cambiarla de hora; el cambio se persiste vía
 * `onReschedule`. Los colores reflejan el estado de la cita.
 */
export function AdminCalendar({
  events,
  onReschedule,
  onSelectEvent,
  onSelectSlot,
  defaultView = Views.WEEK,
  minHour = 7,
  maxHour = 20,
}: AdminCalendarProps) {
  const [view, setView] = useState<View>(defaultView);
  const [date, setDate] = useState<Date>(new Date());

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

  const handleChange: withDragAndDropProps<AdminEvent>['onEventDrop'] = ({ event, start, end }) => {
    onReschedule({ id: event.id, start: toDate(start), end: toDate(end) });
  };

  return (
    <div className="sc-calendar sc-selectable h-[640px] rounded-2xl border border-gray-100 bg-white p-3">
      <DnDCalendar
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
        min={min}
        max={max}
        step={30}
        timeslots={2}
        popup
        resizable
        selectable
        onSelectSlot={(slot) =>
          onSelectSlot?.({ start: toDate(slot.start), end: toDate(slot.end) })
        }
        onEventDrop={handleChange}
        onEventResize={handleChange}
        onSelectEvent={(e) => onSelectEvent?.(e as AdminEvent)}
        eventPropGetter={(e) => ({ className: `sc-status-${(e as AdminEvent).status}` })}
        dayLayoutAlgorithm="no-overlap"
      />
    </div>
  );
}
