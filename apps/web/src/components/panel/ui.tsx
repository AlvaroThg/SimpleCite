'use client';

/** Helpers de UI compartidos del panel: badges de estado, formato de fechas. */

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  TENTATIVE: { label: 'Tentativa', cls: 'bg-gray-100 text-gray-600' },
  PENDING_PAYMENT: { label: 'Pago pendiente', cls: 'bg-amber-100 text-amber-700' },
  CONFIRMED: { label: 'Confirmada', cls: 'bg-green-100 text-green-700' },
  COMPLETED: { label: 'Completada', cls: 'bg-brand-100 text-brand-700' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-red-100 text-red-600' },
  NO_SHOW: { label: 'No asistió', cls: 'bg-orange-100 text-orange-700' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
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
