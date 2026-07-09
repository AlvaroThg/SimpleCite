import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantInfo, type TenantInfo } from '@/lib/api';
import { TenantFooter } from '@/components/TenantFooter';
import { BookingThemeToggle } from '@/components/BookingThemeToggle';
import { readableOn, accentOn } from '@/lib/tenant-color';

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
  const accent = accentOn(primaryColor); // variante AA-safe del color sobre blanco

  const nav = [
    { label: 'Servicios', href: `/${slug}#servicios` },
    { label: 'Especialistas', href: `/${slug}#especialistas` },
    { label: 'Contacto', href: `/${slug}#contacto` },
  ];

  return (
    <>
      {/* Inyectar color corporativo como CSS variable global para el subtree */}
      <style>{`:root { --primary: ${primaryColor}; }`}</style>

      <div className="min-h-screen bg-background flex flex-col">
        {/* Header con branding del tenant: identidad (logo + nombre + promesa),
            navegación a las secciones y el CTA de reserva siempre a mano. */}
        <header className="shadow-md" style={{ backgroundColor: primaryColor, color: onPrimary }}>
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-2.5">
            <Link href={`/${slug}`} className="flex min-w-0 items-center gap-3">
              {logoUrl ? (
                // Chip blanco contenido: el logo respira sin dominar la barra.
                <Image
                  src={logoUrl}
                  alt={tenantName}
                  width={160}
                  height={48}
                  className="h-11 w-auto max-w-[140px] rounded-lg bg-white object-contain p-1"
                  unoptimized
                />
              ) : (
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-white/15 text-lg font-bold">
                  {tenantName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-lg font-bold leading-tight tracking-tight">
                  {tenantName}
                </span>
                <span className="block text-xs leading-tight opacity-75">
                  Reservas en línea las 24 horas
                </span>
              </span>
            </Link>

            <nav className="ml-8 hidden items-center gap-1 md:flex">
              {nav.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium opacity-85 transition hover:bg-white/10 hover:opacity-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2.5">
              <Link
                href={`/${slug}/booking`}
                className="hidden items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-sm transition hover:opacity-90 active:scale-95 sm:inline-flex"
                style={{ color: accent }}
              >
                Reservar cita
              </Link>
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
