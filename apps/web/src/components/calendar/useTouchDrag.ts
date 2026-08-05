'use client';

import { useEffect } from 'react';

/**
 * Arrastrar citas con el dedo, sin pelearse con el scroll.
 *
 * El conflicto: para que la agenda se pueda desplazar verticalmente, el gesto
 * vertical tiene que ser del navegador (`touch-action: pan-y`). Pero entonces
 * arrastrar una cita hacia arriba/abajo también lo toma el navegador como
 * scroll, el arrastre nunca arranca y parece que la función no existe.
 *
 * La solución es la de Google Calendar: el gesto se decide por TIEMPO, no por
 * dirección. Mientras el dedo está quieto sobre una cita se corre un
 * temporizador; si llega al umbral sin moverse, esa cita pasa a
 * `touch-action: none` (el navegador suelta el gesto) y react-big-calendar
 * recibe los touchmove para moverla. Si el dedo se desplaza antes, se cancela
 * el temporizador y el scroll funciona con normalidad.
 *
 * Se aplica sobre el contenedor y funciona por delegación, así que sirve para
 * las citas que RBC monta y desmonta al navegar entre días.
 *
 * @param containerSel selector del contenedor del calendario
 * @param holdMs       tiempo de pulsación sostenida para entrar en modo mover
 */
export function useTouchDrag(containerSel: string, holdMs = 320): void {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(containerSel);
    if (!root) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let armed: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;

    /** Devuelve la cita al estado normal: vuelve a mandar el navegador. */
    const disarm = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (armed) {
        armed.style.touchAction = '';
        armed.classList.remove('sc-ev-armed');
        armed = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('.rbc-event');
      if (!target || e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;

      timer = setTimeout(() => {
        armed = target;
        // A partir de aquí el gesto es nuestro: el navegador deja de hacer
        // scroll con este dedo y RBC puede seguir el movimiento.
        target.style.touchAction = 'none';
        target.classList.add('sc-ev-armed');
        // Vibración corta: confirma que la cita "se despegó" y ya se puede
        // mover. Sin esto no hay forma de saber que el modo se activó.
        navigator.vibrate?.(15);
      }, holdMs);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (armed || !timer) return;
      const t = e.touches[0];
      // Se movió antes de cumplir el tiempo: era un scroll, no un arrastre.
      if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) disarm();
    };

    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: true });
    root.addEventListener('touchend', disarm);
    root.addEventListener('touchcancel', disarm);

    return () => {
      disarm();
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('touchend', disarm);
      root.removeEventListener('touchcancel', disarm);
    };
  }, [containerSel, holdMs]);
}
