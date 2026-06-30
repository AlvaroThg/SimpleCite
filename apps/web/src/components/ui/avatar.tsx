import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Avatar de iniciales con color determinista por nombre (hash → 5 paletas de
 * tokens `--avN-*`). Tamaños sm·md·lg·xl del sistema de diseño. Si se pasan
 * `children` (p. ej. un ícono) se renderizan en lugar de las iniciales.
 */

const SIZES = {
  sm: 'size-7 text-[11px]', // 28px
  md: 'size-9 text-[13px]', // 36px
  lg: 'size-12 text-base', // 48px
  xl: 'size-20 text-[26px]', // 80px
} as const;

export type AvatarSize = keyof typeof SIZES;

/** Iniciales (máx. 2) a partir de un nombre. */
export function getInitials(name: string): string {
  return (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Hash estable de un string → índice de paleta [0,5). */
function paletteIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 5;
}

interface AvatarProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  /** Nombre usado para iniciales y para elegir la paleta de color. */
  name: string;
  size?: AvatarSize;
  /** Sobrescribe el índice de paleta (0-4). Por defecto se deriva del nombre. */
  paletteSeed?: string;
  /** Contenido alternativo (ícono) en vez de iniciales. */
  children?: React.ReactNode;
}

export function Avatar({
  name,
  size = 'md',
  paletteSeed,
  children,
  className,
  style,
  ...props
}: AvatarProps) {
  const idx = paletteIndex(paletteSeed ?? name);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        SIZES[size],
        className,
      )}
      style={{
        backgroundColor: `var(--av${idx}-bg)`,
        color: `var(--av${idx}-tx)`,
        ...style,
      }}
      aria-label={name || undefined}
      {...props}
    >
      {children ?? getInitials(name)}
    </span>
  );
}
