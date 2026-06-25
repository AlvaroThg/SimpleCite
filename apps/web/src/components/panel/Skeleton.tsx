'use client';

/**
 * Skeleton loaders y spinner de marca. Reemplazan los “Cargando…” planos para
 * mejorar la percepción de velocidad imitando el layout final.
 */

/** Spinner SVG animado (anillo). Para acciones puntuales o cargas cortas. */
export function BrandSpinner({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin text-brand-600 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Cargando"
      role="status"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Carga centrada con spinner (para vistas completas). */
export function LoadingView({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
      <BrandSpinner size={32} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Barra/línea base de skeleton. */
function Bar({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />;
}

/** Lista de tarjetas placeholder (citas, pacientes…). */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className="h-4 w-1/3" />
              <Bar className="h-3 w-1/2" />
            </div>
            <div className="space-y-2 text-right">
              <Bar className="h-3 w-20" />
              <Bar className="h-5 w-16 rounded-full ml-auto" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Tarjetas de métricas placeholder (Inicio/Reportes). */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <Bar className="h-3 w-1/2" />
          <Bar className="h-7 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Detalle placeholder (cabecera + bloques). */
export function SkeletonDetail() {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-3">
        <Bar className="h-5 w-1/3" />
        <Bar className="h-3 w-1/4" />
        <div className="grid grid-cols-2 gap-3 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Bar className="h-2.5 w-16" />
              <Bar className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
