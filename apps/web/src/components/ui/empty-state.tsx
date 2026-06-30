import * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Estado vacío del sistema de diseño: ícono atenuado + título + subtexto + CTA. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-8 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center text-text-disabled [&_svg]:size-12">
          {icon}
        </div>
      )}
      <h3 className="text-base font-medium text-text-secondary">{title}</h3>
      {description && <p className="mt-1.5 max-w-[30ch] text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
