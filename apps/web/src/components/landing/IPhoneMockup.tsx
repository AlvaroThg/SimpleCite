'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * iPhone 15 Pro en CSS puro (sin librerías de device mockup) mostrando el
 * valor para la clínica: el calendario de "Citas de hoy" con appointment cards
 * del design system. Flota suavemente, el punto "Pendiente" pulsa y las cards
 * entran escalonadas al aparecer en viewport. Respeta prefers-reduced-motion.
 */

type Status = 'PENDING' | 'CONFIRMED' | 'COMPLETED';
const APPTS: {
  initials: string;
  name: string;
  meta: string;
  time: string;
  status: Status;
  av: number;
}[] = [
  {
    initials: 'JV',
    name: 'Juan Carlos Vargas',
    meta: 'Cardiología · Dr. Mendoza',
    time: '10:30',
    status: 'PENDING',
    av: 3,
  },
  {
    initials: 'MF',
    name: 'María Fernández',
    meta: 'Consulta general · Dra. Ruiz',
    time: '09:00',
    status: 'CONFIRMED',
    av: 0,
  },
  {
    initials: 'RM',
    name: 'Roberto Mamani',
    meta: 'Control · Dr. Mendoza',
    time: '08:30',
    status: 'COMPLETED',
    av: 2,
  },
];
const STATUS: Record<Status, { label: string; bg: string; tx: string; bd: string }> = {
  PENDING: {
    label: 'Pendiente',
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
};

export function IPhoneMockup() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduce) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[260px] lg:max-w-[320px]">
      {/* Sombra/glow de profundidad detrás del teléfono */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[70%] w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/25 blur-[80px]"
      />

      <div className={reduce ? '' : 'animate-iphone-float'}>
        {/* Cuerpo (titanio natural) */}
        <div className="relative aspect-[393/852] w-full rounded-[54px] bg-[#1C1C1E] p-[12px] shadow-[0_50px_100px_rgba(0,0,0,0.35)] ring-1 ring-white/20">
          {/* Botones laterales */}
          <span className="absolute right-[-3px] top-[160px] h-[80px] w-[4px] rounded-r-[3px] bg-[#2C2C2E]" />
          <span className="absolute left-[-3px] top-[120px] h-[34px] w-[4px] rounded-l-[3px] bg-[#2C2C2E]" />
          <span className="absolute left-[-3px] top-[168px] h-[62px] w-[4px] rounded-l-[3px] bg-[#2C2C2E]" />
          <span className="absolute left-[-3px] top-[242px] h-[62px] w-[4px] rounded-l-[3px] bg-[#2C2C2E]" />

          {/* Dynamic Island */}
          <div className="absolute left-1/2 top-[14px] z-10 h-[34px] w-[112px] -translate-x-1/2 rounded-full bg-black" />

          {/* Pantalla */}
          <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[44px] bg-canvas">
            {/* Status bar iOS */}
            <div className="flex items-center justify-between px-6 pb-1 pt-3.5 text-[12px] font-semibold text-text-primary">
              <span>9:41</span>
              <span className="flex items-center gap-1.5">
                {/* señal */}
                <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor">
                  <rect x="0" y="7" width="3" height="4" rx="1" />
                  <rect x="4.5" y="5" width="3" height="6" rx="1" />
                  <rect x="9" y="2.5" width="3" height="8.5" rx="1" />
                  <rect x="13" y="0" width="3" height="11" rx="1" />
                </svg>
                {/* wifi */}
                <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor">
                  <path d="M7.5 2.2c2.3 0 4.4.9 6 2.3l-1.2 1.3A6.9 6.9 0 0 0 7.5 4a6.9 6.9 0 0 0-4.8 1.8L1.5 4.5A9 9 0 0 1 7.5 2.2Zm0 3.2c1.4 0 2.7.5 3.7 1.4l-1.3 1.3a3.5 3.5 0 0 0-4.8 0L3.8 6.8A5.3 5.3 0 0 1 7.5 5.4Zm0 3.1 1.6 1.6-1.6 1.6-1.6-1.6L7.5 8.5Z" />
                </svg>
                {/* batería */}
                <span className="flex items-center">
                  <span className="flex h-[11px] w-[22px] items-center rounded-[3px] border border-current p-[1.5px]">
                    <span className="h-full w-[75%] rounded-[1px] bg-current" />
                  </span>
                  <span className="ml-[1px] h-[4px] w-[1.5px] rounded-r bg-current" />
                </span>
              </span>
            </div>

            {/* Header */}
            <div className="px-5 pt-3">
              <p className="text-[15px] font-bold tracking-[-0.01em] text-text-primary">
                Citas de hoy
              </p>
              <p className="text-[11px] text-text-muted">Clínica Tarija</p>
            </div>

            {/* Appointment cards */}
            <div className="space-y-2.5 px-4 pt-3.5">
              {APPTS.map((a, i) => {
                const s = STATUS[a.status];
                return (
                  <div
                    key={a.name}
                    className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface p-2.5 shadow-card transition-all duration-[400ms] ease-out"
                    style={{
                      opacity: shown ? 1 : 0,
                      transform: shown ? 'none' : 'translateY(12px)',
                      transitionDelay: reduce ? '0ms' : `${i * 80}ms`,
                    }}
                  >
                    <span
                      className="flex size-8 flex-none items-center justify-center rounded-full text-[10px] font-semibold"
                      style={{
                        backgroundColor: `var(--av${a.av}-bg)`,
                        color: `var(--av${a.av}-tx)`,
                      }}
                    >
                      {a.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-text-primary">
                        {a.name}
                      </p>
                      <p className="truncate text-[10px] text-text-muted">{a.meta}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className="inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[9px] font-medium"
                        style={{ backgroundColor: s.bg, color: s.tx, borderColor: s.bd }}
                      >
                        <span
                          className={`size-1 rounded-full bg-current ${
                            a.status === 'PENDING' && !reduce ? 'animate-pulse' : ''
                          }`}
                        />
                        {s.label}
                      </span>
                      <span className="font-mono text-[10px] text-text-muted">{a.time}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
