'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-toggle';

/**
 * Toggle de tema para el header de las páginas públicas del tenant (booking).
 * Hereda el color del header (texto sobre el color de marca) con `text-current`,
 * así funciona sobre cualquier `primaryColor`.
 */
export function BookingThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
      className="inline-flex size-9 items-center justify-center rounded-lg text-current transition-colors hover:bg-white/15 active:scale-95"
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
