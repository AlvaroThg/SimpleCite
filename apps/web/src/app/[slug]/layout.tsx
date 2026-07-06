import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTenantInfo, type TenantInfo } from '@/lib/api';
import { TenantFooter } from '@/components/TenantFooter';
import { BookingThemeToggle } from '@/components/BookingThemeToggle';
import { readableOn } from '@/lib/tenant-color';

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
  const onPrimary = readableOn(primaryColor); // texto legible sobre el color del tenant (AA)

  return (
    <>
      {/* Inyectar color corporativo como CSS variable global para el subtree */}
      <style>{`:root { --primary: ${primaryColor}; }`}</style>

      <div className="min-h-screen bg-background flex flex-col">
        {/* Header con branding del tenant */}
        <header className="shadow-md" style={{ backgroundColor: primaryColor, color: onPrimary }}>
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3.5">
            {logoUrl ? (
              // Fondo blanco sólido: el logo se aprecia entero sobre cualquier
              // color de marca, y más grande para que se lea de un vistazo.
              <Image
                src={logoUrl}
                alt={tenantName}
                width={280}
                height={80}
                className="h-16 w-auto max-w-[240px] rounded-xl bg-white object-contain p-1.5 shadow-sm sm:h-[4.5rem]"
                unoptimized
              />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/15 text-xl font-bold">
                {tenantName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="text-xl font-bold tracking-tight sm:text-2xl">{tenantName}</span>
            <div className="ml-auto">
              <BookingThemeToggle />
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <TenantFooter
          name={tenantName}
          primaryColor={primaryColor}
          address={tenant.address}
          mapsUrl={tenant.mapsUrl}
          facebookUrl={tenant.facebookUrl}
          instagramUrl={tenant.instagramUrl}
          whatsappContact={tenant.whatsappContact}
        />
      </div>
    </>
  );
}
