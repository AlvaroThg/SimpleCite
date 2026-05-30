import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTenantInfo } from '@/lib/api';

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const tenant = await getTenantInfo(slug, { next: { revalidate: 3600 } });
    return {
      title: `${tenant.name} — Reserva tu cita`,
      description: `Reserva tu cita en ${tenant.name}. Sistema online de turnos médicos.`,
    };
  } catch {
    return { title: 'SimpleCite' };
  }
}

export default async function TenantLayout({ children, params }: Props) {
  const { slug } = await params;

  let primaryColor = '#3B82F6';
  let tenantName = '';
  let logoUrl: string | null = null;

  try {
    const tenant = await getTenantInfo(slug, { next: { revalidate: 3600 } });
    primaryColor = tenant.primaryColor;
    tenantName = tenant.name;
    logoUrl = tenant.logoUrl;
  } catch {
    notFound();
  }

  return (
    <>
      {/* Inyectar color corporativo como CSS variable global para el subtree */}
      <style>{`:root { --primary: ${primaryColor}; }`}</style>

      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header con branding del tenant */}
        <header className="text-white shadow-md" style={{ backgroundColor: primaryColor }}>
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            {logoUrl && (
              <Image
                src={logoUrl}
                alt={tenantName}
                width={40}
                height={40}
                className="h-10 w-auto object-contain rounded"
                unoptimized
              />
            )}
            <span className="font-bold text-xl tracking-tight">{tenantName}</span>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="text-center text-xs text-gray-400 py-4 border-t">
          Powered by{' '}
          <a
            href="https://simplecite.com.bo"
            className="underline hover:text-gray-600"
            target="_blank"
            rel="noreferrer"
          >
            SimpleCite
          </a>
        </footer>
      </div>
    </>
  );
}
