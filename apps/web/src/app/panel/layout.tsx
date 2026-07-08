import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/panel-auth';
import { PanelErrorBoundary } from '@/components/panel/ErrorBoundary';

export const metadata: Metadata = {
  title: 'SimpleCite — Panel',
  description: 'Panel profesional para staff y doctores.',
};

/**
 * Layout del panel profesional. Provee el contexto de auth a todo /panel y un
 * Error Boundary: una excepción de render en cualquier página muestra un card
 * accionable (reintentar / cerrar sesión) en vez del error genérico de Next.
 * El gating de sesión lo hace cada página vía useRequireAuth (client-side).
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PanelErrorBoundary>
      <AuthProvider>{children}</AuthProvider>
    </PanelErrorBoundary>
  );
}
