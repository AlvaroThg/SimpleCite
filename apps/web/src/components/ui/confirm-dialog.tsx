'use client';

import * as React from 'react';
import { Modal } from './modal';
import { Button } from './button';

/**
 * Diálogo de confirmación del sistema de diseño — reemplaza al `confirm()`
 * nativo del navegador para acciones destructivas o importantes (eliminar,
 * archivar, cancelar una cita). Variante `danger` pinta el botón de rojo.
 */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  /** Deshabilita los botones mientras la acción corre. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      maxWidthClassName="max-w-sm"
      footer={
        <>
          <Button variant="outline" disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            disabled={loading}
            onClick={onConfirm}
            className={variant === 'danger' ? 'bg-destructive text-white hover:bg-red-700' : ''}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
