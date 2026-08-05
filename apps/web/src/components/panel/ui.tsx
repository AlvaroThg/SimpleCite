'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';

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

/**
 * Volver a la pantalla anterior. Antes cada pantalla lo resolvía a mano —dos
 * con una flecha "←" de texto y otra con ícono— y varias directamente no lo
 * tenían, dejando al usuario sin salida en móvil (donde no hay barra lateral
 * a la vista). Área de toque de 44px: el mínimo cómodo con el dedo.
 */
export function BackLink({ label = 'Volver', href }: { label?: string; href?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (href ? router.push(href) : router.back())}
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-text-secondary transition hover:bg-canvas hover:text-text-primary active:scale-95"
    >
      <ArrowLeft className="size-4" />
      {label}
    </button>
  );
}

/**
 * Campo de contraseña con "ojo" para revelar lo escrito.
 *
 * Compartido a propósito: el login y el alta de doctores tenían cada uno su
 * propio input y el ojo se agregó solo en uno. Renderiza el input y el botón;
 * la etiqueta la pone cada pantalla, que ya tiene su propio estilo.
 */
export function PasswordInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <span className="relative block">
      <input
        type={reveal ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`pr-11 ${className}`}
      />
      <button
        type="button"
        // El botón vive dentro de un <label> en algunas pantallas: sin esto el
        // clic se reenvía al input y el foco salta mientras se revela.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setReveal((v) => !v)}
        aria-label={reveal ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={reveal}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-text-muted transition hover:text-text-primary"
      >
        {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </span>
  );
}
