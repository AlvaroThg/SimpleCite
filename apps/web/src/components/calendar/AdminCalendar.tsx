'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Calendar, Views, type View } from 'react-big-calendar';
import withDragAndDrop, {
  type withDragAndDropProps,
} from 'react-big-calendar/lib/addons/dragAndDrop';
import { format } from 'date-fns';
import { toast } from 'sonner';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import './calendar.css';
import { localizer, messagesEs, formatsEs } from './localizer';
import { readableOn } from '@/lib/tenant-color';

/** Cita tal como la ve el doctor: con nombre del paciente, estado y servicio. */
export interface AdminEvent {
  id: string;
  title: string; // nombre del paciente
  start: Date;
  end: Date;
  status: string;
  doctorName?: string;
  serviceName?: string;
  /** Color hex del servicio (pinta las citas no terminadas). */
  color?: string | null;
  /** Línea extra del bloque detallado (ADMIN/STAFF): "Dr. X · Bs 150". */
  detailLine?: string | null;
}

const BRAND = '#0860dd';
const isHex = (c?: string | null): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c);

/**
 * Estilo del evento según estado:
 *   - COMPLETED → verde (terminal, "listo").
 *   - NO_SHOW   → gris (no asistió).
 *   - resto (TENTATIVE/PENDING_PAYMENT/CONFIRMED) → color del servicio.
 * (CANCELLED no se muestra: el horario queda libre.)
 */
function eventStyle(e: AdminEvent): { className?: string; style?: CSSProperties } {
  if (e.status === 'COMPLETED') return { className: 'sc-status-COMPLETED' };
  if (e.status === 'NO_SHOW') return { className: 'sc-status-NO_SHOW' };
  const bg = isHex(e.color) ? e.color : BRAND;
  // El texto se calcula para cumplir contraste AA sobre el color del servicio
  // (blanco o navy según el color elegido por la clínica).
  return { style: { backgroundColor: bg, borderColor: bg, color: readableOn(bg) } };
}

/**
 * Contenido del bloque: hora + paciente + servicio, y para ADMIN/STAFF una
 * línea extra con el especialista y el precio (detailLine). En bloques cortos
 * las líneas se recortan; el tooltip siempre trae la información completa.
 */
function AdminEventCell({ event }: { event: AdminEvent }) {
  return (
    <div className="leading-tight">
      <div className="truncate text-[11px] font-semibold">
        {format(event.start, 'HH:mm')} {event.title}
      </div>
      {event.serviceName && (
        <div className="truncate text-[10px] opacity-90">{event.serviceName}</div>
      )}
      {event.detailLine && (
        <div className="truncate text-[10px] font-medium opacity-90">{event.detailLine}</div>
      )}
    </div>
  );
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

  // Responsive: en pantallas chicas, vista Día (como Google Calendar móvil).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches) {
      setView(Views.DAY);
    }
  }, []);

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
  const scrollToTime = useMemo(() => {
    const d = new Date();
    d.setHours(minHour, 0, 0, 0);
    return d;
  }, [minHour]);

  const handleChange: withDragAndDropProps<AdminEvent>['onEventDrop'] = ({ event, start, end }) => {
    onReschedule({ id: event.id, start: toDate(start), end: toDate(end) });
  };

  return (
    <div className="sc-calendar sc-selectable h-[640px] rounded-2xl border border-gray-100 bg-white p-2 sm:h-[720px] sm:p-3">
      <DnDCalendar
        localizer={localizer}
        culture="es"
        messages={messagesEs}
        formats={formatsEs}
        components={{ event: AdminEventCell }}
        events={events}
        view={view}
        onView={setView}
        date={date}
        onNavigate={setDate}
        views={[Views.MONTH, Views.WEEK, Views.DAY]}
        min={min}
        max={max}
        step={30}
        timeslots={1}
        scrollToTime={scrollToTime}
        popup
        resizable
        selectable
        onSelectSlot={(slot) => {
          // No se reserva hacia atrás: avisamos en vez de abrir el modal y
          // fallar recién al guardar. El server valida igual (defensa en fondo).
          const start = toDate(slot.start);
          if (start.getTime() < Date.now()) {
            toast.error('No puede reservar en una hora que ya pasó');
            return;
          }
          onSelectSlot?.({ start, end: toDate(slot.end) });
        }}
        onEventDrop={handleChange}
        onEventResize={handleChange}
        onSelectEvent={(e) => onSelectEvent?.(e as AdminEvent)}
        tooltipAccessor={(e) => {
          const ev = e as AdminEvent;
          const time = `${format(ev.start, 'HH:mm')}–${format(ev.end, 'HH:mm')}`;
          return [time, ev.title, ev.serviceName, ev.detailLine ?? ev.doctorName]
            .filter(Boolean)
            .join(' · ');
        }}
        eventPropGetter={(e) => eventStyle(e as AdminEvent)}
        // Las franjas ya pasadas se ven apagadas: la agenda deja claro de un
        // vistazo hasta dónde se puede reservar.
        slotPropGetter={(d: Date) =>
          d.getTime() < Date.now() ? { className: 'sc-slot-past' } : {}
        }
        dayPropGetter={(d: Date) => {
          const end = new Date(d);
          end.setHours(23, 59, 59, 999);
          return end.getTime() < Date.now() ? { className: 'sc-day-past' } : {};
        }}
        dayLayoutAlgorithm="no-overlap"
      />
    </div>
  );
}
