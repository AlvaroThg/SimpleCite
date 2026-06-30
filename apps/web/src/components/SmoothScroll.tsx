'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

/**
 * Scroll suave global (Lenis), montado una sola vez en el layout raíz. Se
 * desactiva por completo si el usuario prefiere movimiento reducido. No
 * renderiza nada: solo gestiona el RAF de Lenis sobre el scroll de la página.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
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
  }, []);

  return null;
}
