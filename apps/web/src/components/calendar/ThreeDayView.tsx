'use client';

import { Navigate } from 'react-big-calendar';
// @ts-expect-error — react-big-calendar no publica tipos para sus subrutas de
// `lib/`; TimeGrid es la misma grilla que usan las vistas Día y Semana.
import TimeGrid from 'react-big-calendar/lib/TimeGrid';
import { addDays, format, isSameMonth } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Vista de 3 días (ayer/hoy/mañana desde la fecha activa), pensada para el
 * móvil: da contexto de los días vecinos sin apretar 7 columnas en una pantalla
 * chica. react-big-calendar no la trae, pero permite vistas propias siempre que
 * expongan `range`, `navigate` y `title`; por dentro reusa TimeGrid, así que
 * hereda arrastrar, redimensionar y selección de huecos sin código extra.
 */

const DAYS = 3;

interface ThreeDayProps {
  date: Date;
  localizer: unknown;
  [key: string]: unknown;
}

export function ThreeDayView({ date, ...props }: ThreeDayProps) {
  const range = ThreeDayView.range(date);
  return <TimeGrid {...props} range={range} eventOffset={15} />;
}

/** Los días que se muestran. RBC lo llama para saber qué pedir/pintar. */
ThreeDayView.range = (date: Date): Date[] =>
  Array.from({ length: DAYS }, (_, i) => addDays(date, i));

/** Navegación: avanza y retrocede de a 3 días (no de a uno). */
ThreeDayView.navigate = (date: Date, action: (typeof Navigate)[keyof typeof Navigate]): Date => {
  switch (action) {
    case Navigate.PREVIOUS:
      return addDays(date, -DAYS);
    case Navigate.NEXT:
      return addDays(date, DAYS);
    default:
      return date;
  }
};

/** Título de la barra: "1 – 3 de agosto" o "30 de julio – 1 de agosto". */
ThreeDayView.title = (date: Date): string => {
  const last = addDays(date, DAYS - 1);
  const from = isSameMonth(date, last)
    ? format(date, 'd', { locale: es })
    : format(date, "d 'de' MMMM", { locale: es });
  return `${from} – ${format(last, "d 'de' MMMM", { locale: es })}`;
};
