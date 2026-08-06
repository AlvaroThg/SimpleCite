'use client';

import { useEffect } from 'react';

/**
 * Arrastrar citas con el dedo sin pelearse con el scroll de la agenda.
 *
 * El problema: si las citas dejan el gesto vertical al navegador
 * (`touch-action: pan-y`), arrastrarlas hacia arriba o abajo se interpreta como
 * desplazar la página y el arrastre nunca arranca. Y no sirve cambiar
 * `touch-action` cuando se cumple la pulsación larga: el navegador decide qué
 * hacer con el dedo en el `touchstart` y NO reconsidera a mitad del gesto —
 * por eso el primer intento de arreglo no funcionaba.
 *
 * La solución es al revés: las citas declaran `touch-action: none` desde el
 * inicio (CSS), así el navegador nunca se queda el gesto, y este hook decide:
 *
 *   - Pulsación sostenida (`holdMs`) sin mover → la cita "se despega" y el
 *     arrastre pasa a react-big-calendar.
 *   - Dedo que se mueve antes → era un scroll: se desplaza la agenda a mano,
 *     replicando lo que habría hecho el navegador.
 *
 * Un toque corto sigue siendo un toque (abre el detalle de la cita).
 *
 * @param containerSel selector del contenedor del calendario
 * @param holdMs       pulsación sostenida para entrar en modo mover
 */
export function useTouchDrag(containerSel: string, holdMs = 320): void {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(containerSel);
    if (!root) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let armed: HTMLElement | null = null;
    /** Cita bajo el dedo mientras se decide si es scroll o arrastre. */
    let candidate: HTMLElement | null = null;
    let scroller: HTMLElement | null = null;
    let startY = 0;
    let startX = 0;
    let lastY = 0;

    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      armed?.classList.remove('sc-ev-armed');
      armed = null;
      candidate = null;
      scroller = null;
    };

    const onTouchStart = (e: TouchEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('.rbc-event');
      if (!target || e.touches.length !== 1) return;

      candidate = target;
      scroller = target.closest<HTMLElement>('.rbc-time-content');
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      lastY = t.clientY;

      timer = setTimeout(() => {
        armed = target;
        target.classList.add('sc-ev-armed');
        // Vibración corta: sin esto no hay forma de saber que la cita ya se
        // puede mover, y el usuario sigue presionando sin efecto visible.
        navigator.vibrate?.(15);
      }, holdMs);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!candidate || e.touches.length !== 1) return;
      // Ya está en modo mover: el arrastre es de react-big-calendar.
      if (armed) return;

      const t = e.touches[0];
      const movedFar = Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8;

      if (movedFar && timer) {
        // Se movió antes de tiempo: era un scroll, no un arrastre.
        clearTimeout(timer);
        timer = null;
      }

      // El navegador no va a desplazar (las citas son touch-action: none), así
      // que se replica el desplazamiento a mano mientras no haya arrastre.
      if (!timer && scroller) {
        scroller.scrollTop -= t.clientY - lastY;
      }
      lastY = t.clientY;
    };

    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: true });
    root.addEventListener('touchend', reset);
    root.addEventListener('touchcancel', reset);

    return () => {
      reset();
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('touchend', reset);
      root.removeEventListener('touchcancel', reset);
    };
  }, [containerSel, holdMs]);
}
