'use client';

import * as React from 'react';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Toaster global de la app (sonner). richColors da estilos de error/éxito. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-right"
      richColors
      closeButton
      toastOptions={{ classNames: { toast: 'rounded-xl' } }}
      {...props}
    />
  );
}

export { Toaster };
