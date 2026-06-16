import { dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Localizer de react-big-calendar basado en date-fns (ya es dependencia del
 * repo). Semana empieza en lunes. Compartido por BookingCalendar y AdminCalendar.
 */
export const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { es },
});

/** Textos de la UI del calendario en español. */
export const messagesEs = {
  date: 'Fecha',
  time: 'Hora',
  event: 'Cita',
  allDay: 'Todo el día',
  week: 'Semana',
  work_week: 'Semana laboral',
  day: 'Día',
  month: 'Mes',
  previous: 'Anterior',
  next: 'Siguiente',
  yesterday: 'Ayer',
  tomorrow: 'Mañana',
  today: 'Hoy',
  agenda: 'Agenda',
  noEventsInRange: 'No hay citas en este rango.',
  showMore: (total: number) => `+ Ver ${total} más`,
};

/** Formatos en español (rangos de hora compactos). */
export const formatsEs = {
  timeGutterFormat: 'HH:mm',
  eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`,
};
