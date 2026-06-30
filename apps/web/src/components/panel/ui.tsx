'use client';

/** Helpers de UI compartidos del panel: badges de estado, formato de fechas. */

/**
 * Estado de cita como dato (no feedback): punto de 6px + fondo + texto + borde,
 * derivados de los tokens de estado del sistema de diseño. Semántica corregida
 * respecto a la versión anterior (CONFIRMED → azul, COMPLETED → verde,
 * TENTATIVE → morado, CANCELLED → gris, NO_SHOW → rojo). Sin animación.
 */
const STATUS_STYLES: Record<string, { label: string; bg: string; tx: string; bd: string }> = {
  TENTATIVE: {
    label: 'Tentativa',
    bg: 'var(--st-tent-bg)',
    tx: 'var(--st-tent-tx)',
    bd: 'var(--st-tent-bd)',
  },
  PENDING_PAYMENT: {
    label: 'Pendiente de pago',
    bg: 'var(--st-pend-bg)',
    tx: 'var(--st-pend-tx)',
    bd: 'var(--st-pend-bd)',
  },
  CONFIRMED: {
    label: 'Confirmada',
    bg: 'var(--st-conf-bg)',
    tx: 'var(--st-conf-tx)',
    bd: 'var(--st-conf-bd)',
  },
  COMPLETED: {
    label: 'Completada',
    bg: 'var(--st-comp-bg)',
    tx: 'var(--st-comp-tx)',
    bd: 'var(--st-comp-bd)',
  },
  CANCELLED: {
    label: 'Cancelada',
    bg: 'var(--st-canc-bg)',
    tx: 'var(--st-canc-tx)',
    bd: 'var(--st-canc-bd)',
  },
  NO_SHOW: {
    label: 'No se presentó',
    bg: 'var(--st-nosh-bg)',
    tx: 'var(--st-nosh-tx)',
    bd: 'var(--st-nosh-bd)',
  },
};

export function StatusBadge({ status }: { status: string }) {
  const s =
    STATUS_STYLES[status] ??
    ({
      label: status,
      bg: 'var(--st-canc-bg)',
      tx: 'var(--st-canc-tx)',
      bd: 'var(--st-canc-bd)',
    } as const);
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border py-[3px] pl-2 pr-2.5 text-xs font-medium leading-[1.4]"
      style={{ backgroundColor: s.bg, color: s.tx, borderColor: s.bd }}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

const TZ = 'America/La_Paz';

export function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat('es-BO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
    hour12: false,
  }).format(new Date(iso));
}

export function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
    hour12: false,
  }).format(new Date(iso));
}

export function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('es-BO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  }).format(new Date(iso));
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-400">
      <svg
        className="animate-spin text-brand-600"
        width={28}
        height={28}
        viewBox="0 0 24 24"
        fill="none"
        role="status"
        aria-label="Cargando"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
      {message}
    </div>
  );
}
