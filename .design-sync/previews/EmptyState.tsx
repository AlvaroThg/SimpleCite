import * as React from 'react';
import { EmptyState, Button } from 'web';

const CalendarIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

export const SinCitas = () => (
  <div style={{ maxWidth: 440 }}>
    <EmptyState
      icon={CalendarIcon}
      title="No tienes citas para hoy"
      description="Cuando un paciente reserve, su cita aparecerá aquí con la hora y el especialista."
      action={<Button size="sm">Nueva cita</Button>}
    />
  </div>
);

export const Minimo = () => (
  <div style={{ maxWidth: 440 }}>
    <EmptyState title="Sin resultados" description="Ajusta los filtros e intenta de nuevo." />
  </div>
);
