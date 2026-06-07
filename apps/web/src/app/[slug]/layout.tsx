import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTenantInfo, type TenantInfo } from '@/lib/api';
import { TenantFooter } from '@/components/TenantFooter';

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

  // revalidate corto: que un cambio de branding/contacto en Settings se refleje pronto.
  let tenant: TenantInfo;
  try {
    tenant = await getTenantInfo(slug, { next: { revalidate: 60 } });
  } catch {
    notFound();
  }
  const primaryColor = tenant.primaryColor;
  const tenantName = tenant.name;
  const logoUrl = tenant.logoUrl;

  return (
    <>
      {/* Inyectar color corporativo como CSS variable global para el subtree */}
      <style>{`:root { --primary: ${primaryColor}; }`}</style>

      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header con branding del tenant */}
        <header className="text-white shadow-md" style={{ backgroundColor: primaryColor }}>
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={tenantName}
                width={200}
                height={56}
                className="h-12 w-auto max-w-[200px] rounded-lg bg-white/10 object-contain p-1"
                unoptimized
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/15 text-lg font-bold">
                {tenantName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="text-2xl font-bold tracking-tight">{tenantName}</span>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <TenantFooter
          name={tenantName}
          primaryColor={primaryColor}
          address={tenant.address}
          facebookUrl={tenant.facebookUrl}
          instagramUrl={tenant.instagramUrl}
          whatsappContact={tenant.whatsappContact}
        />
      </div>
    </>
  );
}
