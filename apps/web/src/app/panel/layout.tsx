import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/panel-auth';

export const metadata: Metadata = {
  title: 'SimpleCite — Panel',
  description: 'Panel profesional para staff y doctores.',
};

/**
 * Layout del panel profesional. Provee el contexto de auth a todo /panel.
 * El gating de sesión lo hace cada página vía useRequireAuth (client-side),
 * por eso el layout solo envuelve con el provider.
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
