import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,border-color,transform,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 active:scale-[.98] shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Primary — único azul accionable de la marca.
        default: 'bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]',
        // Danger — acciones destructivas (cancelar cita, eliminar).
        destructive: 'bg-destructive text-destructive-foreground hover:bg-[#dc2626]',
        // Secondary del rediseño: superficie blanca con borde.
        outline:
          'border border-border bg-surface text-text-secondary hover:bg-canvas hover:border-border-strong hover:text-text-primary',
        // Relleno suave (slate) — acciones secundarias dentro de superficies claras.
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        // Ghost — acciones terciarias / "más tarde".
        ghost: 'text-text-muted hover:bg-accent hover:text-text-primary',
        link: 'text-primary underline-offset-4 hover:underline',
        // WhatsApp — exclusivo para acciones de WhatsApp.
        whatsapp: 'bg-whatsapp text-white hover:bg-[var(--whatsapp-hover)]',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-[13px]',
        lg: 'h-11 rounded-lg px-6 text-base',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
