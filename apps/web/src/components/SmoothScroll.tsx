'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';

/**
 * Scroll suave (Lenis) para las superficies públicas (landing, booking del
 * tenant). Se omite en el panel del staff (`/panel`), que es denso y tiene sus
 * propios contenedores de scroll, y se desactiva con prefers-reduced-motion.
 * No renderiza nada: solo gestiona el RAF de Lenis.
 */
export function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      pathname?.startsWith('/panel') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      // Suave pero sin "flotar" demasiado en gama media.
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [pathname]);

  return null;
}
