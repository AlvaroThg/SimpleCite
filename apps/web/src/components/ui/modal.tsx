'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Modal del sistema de diseño: backdrop oscuro + blur, tarjeta `surface-raised`
 * con radio grande y sombra de modal. Controlado por `open`/`onClose`. Cierra
 * con Escape y clic en el backdrop, bloquea el scroll del body y respeta
 * prefers-reduced-motion (vía la clase `animate-modal-in`).
 */
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Ancho máximo de la tarjeta (clase Tailwind). */
  maxWidthClassName?: string;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidthClassName = 'max-w-md',
  className,
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="animate-backdrop-in absolute inset-0 bg-[rgba(2,6,23,0.4)] backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={cn(
          'animate-modal-in relative w-full rounded-2xl border border-border bg-surface-raised p-6 shadow-modal',
          maxWidthClassName,
          className,
        )}
      >
        <div className="mb-1.5 flex items-start justify-between gap-3">
          {title ? <h2 className="text-lg font-semibold text-text-primary">{title}</h2> : <span />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 flex rounded-md p-1 text-text-muted transition-colors hover:bg-canvas hover:text-text-primary"
          >
            <X className="size-[18px]" />
          </button>
        </div>
        {description && <p className="mb-4 text-sm text-text-secondary">{description}</p>}
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
