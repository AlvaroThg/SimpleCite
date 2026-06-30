'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const KEY = 'sc-theme';

/** Aplica el tema al <html> y lo persiste. */
function apply(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* localStorage no disponible: el tema vive solo en memoria */
  }
}

/** Estado de tema (claro por defecto; solo se vuelve oscuro de forma explícita). */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const current =
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    setTheme(current);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    apply(next);
    setTheme(next);
  };

  return { theme, toggle };
}

/** Botón de cambio de tema claro/oscuro. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
      className={`inline-flex size-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-muted hover:text-text-primary active:scale-95 ${className}`}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
