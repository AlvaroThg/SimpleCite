import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SimpleCite — Gestión de Consultorios Médicos',
  description:
    'Sistema SaaS para la gestión integral de citas, pagos por QR y registros médicos para clínicas en Bolivia.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
