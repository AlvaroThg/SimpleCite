import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CancelClient } from './cancel-client';

export const metadata: Metadata = {
  title: 'Cancelar cita · SimpleCite',
  robots: { index: false, follow: false },
};

/**
 * Página pública de cancelación por magic link: /citas/cancelar?token=...
 * Vive en el apex (sin tenant) — el token identifica la cita.
 */
export default function CancelarCitaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Suspense fallback={null}>
        <CancelClient />
      </Suspense>
    </main>
  );
}
