import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ShieldCheck,
  CalendarCheck,
  MessageCircle,
  Clock,
  ArrowRight,
  MapPin,
  Stethoscope,
  Banknote,
  Phone,
} from 'lucide-react';
import { getTenantInfo, getDoctors } from '@/lib/api';
import { getServiceIcon } from '@/lib/service-icons';
import { readableOn, accentOn } from '@/lib/tenant-color';
import { mapsEmbedSrc } from '@/lib/maps';
import { botDeepLink } from '@/lib/bot-link';
import { InstagramFeed } from '@/components/InstagramFeed';

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 60; // ISR: refleja cambios de branding pronto

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Nombre corto para el CTA "Agendar con …". Si el nombre empieza con un
 * honorífico (Dr., Dra., Lic.), solo el primer token dejaba "Agendar con Dr.";
 * en ese caso se incluye también el nombre propio.
 */
function shortDoctorName(name: string) {
  const [first, second] = name.trim().split(/\s+/);
  return /^(dr|dra|lic|dn)\.?$/i.test(first ?? '') && second ? `${first} ${second}` : (first ?? '');
}

export default async function TenantLandingPage({ params }: Props) {
  const { slug } = await params;

  let tenant;
  let doctors;
  try {
    [tenant, doctors] = await Promise.all([
      getTenantInfo(slug, { next: { revalidate } }),
      getDoctors(slug, { next: { revalidate } }),
    ]);
  } catch {
    notFound();
  }

  const primary = tenant.primaryColor || '#3B82F6';
  const secondary = tenant.secondaryColor || primary;
  // Contraste por tenant (Regla del Tenant): texto legible sobre el color, y
  // variante AA-safe del color para texto sobre fondo blanco.
  const onPrimary = readableOn(primary);
  const accent = accentOn(primary);

  // Defensivo: una respuesta cacheada (ISR) de un API anterior puede no traer
  // el campo aún; la landing no debe romperse por eso.
  const insurances = tenant.insurances ?? [];

  // Servicios únicos agregados desde los doctores (conserva el ícono).
  const services = Array.from(
    new Map(
      doctors.flatMap((d) => d.doctorServices.map((ds) => [ds.service.name, ds.service])),
    ).values(),
  );

  // Especialidades únicas con cuántos profesionales las atienden.
  const specialties = Array.from(
    doctors.reduce((map, d) => {
      const sp = d.doctorProfile?.specialty?.trim();
      if (sp) map.set(sp, (map.get(sp) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  );

  // Qué ofrece la página según el plan de la clínica:
  //   BOOKING  → reserva web completa.
  //   WHATSAPP → el CTA abre el chat de la clínica (sin reserva web).
  //   LANDING  → solo informativa: el paciente llama y el staff agenda.
  const publicMode = tenant.publicMode ?? 'BOOKING';
  const canBookOnline = publicMode === 'BOOKING';

  // Textos editables con fallbacks por defecto. El de reserva promete "sin
  // llamadas": solo aplica cuando de verdad hay reserva web.
  const heroTitle = tenant.heroTitle || `Tu salud, agendada en minutos en ${tenant.name}`;
  const heroSubtitle =
    tenant.heroSubtitle ||
    (canBookOnline
      ? 'Reserva tu cita en línea con nuestros especialistas. Sin llamadas, sin esperas: elige, confirma y listo.'
      : publicMode === 'WHATSAPP'
        ? 'Escríbenos por WhatsApp y coordinamos tu cita con el especialista que necesitas.'
        : 'Conoce a nuestros especialistas y comunícate con nosotros para agendar tu cita.');
  const servicesTitle = tenant.servicesTitle || 'Nuestros servicios';
  const specialistsTitle = tenant.specialistsTitle || 'Nuestros especialistas';
  const ctaTitle = tenant.ctaTitle || '¿Listo para tu cita?';
  const ctaSubtitle =
    tenant.ctaSubtitle || `Reserva en menos de un minuto. Te esperamos en ${tenant.name}.`;

  // Imagen del hero: la de portada, o la fachada como respaldo con rostro real.
  const heroImage = tenant.heroImageUrl || tenant.locationPhotoUrl;

  const waLink = tenant.whatsappContact
    ? `https://wa.me/${tenant.whatsappContact.replace(/\D/g, '')}`
    : null;
  const mapsLink =
    tenant.mapsUrl ||
    (tenant.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.address)}`
      : null);
  // Coordenadas exactas del link de Maps del admin; la dirección textual es
  // solo el respaldo (Google puede geocodificarla al negocio equivocado).
  const mapsEmbed = mapsEmbedSrc(tenant.mapsUrl, tenant.address);

  // Deep link al bot de reservas (null si la plataforma no tiene bot, o si
  // esta clínica no tiene el add-on activado).
  const botLink = tenant.botEnabled ? botDeepLink(slug) : null;

  const clinicWhatsapp = tenant.whatsappContact
    ? `https://wa.me/${tenant.whatsappContact}?text=${encodeURIComponent(
        `Hola, quiero reservar una cita en ${tenant.name}.`,
      )}`
    : null;
  // En modo WhatsApp el CTA principal es el chat; si la clínica no cargó su
  // número, cae a llamar/ver la ubicación en vez de dejar un botón muerto.
  const primaryCta =
    publicMode === 'WHATSAPP' && clinicWhatsapp
      ? { href: clinicWhatsapp, label: 'Reservar por WhatsApp', external: true }
      : canBookOnline
        ? { href: `/${slug}/booking`, label: 'Reservar cita', external: false }
        : null;

  // Destino de todos los "reservar" de la página. Sin reserva online apuntan al
  // chat de la clínica; y si tampoco hay número, a la sección de contacto.
  const bookHref = primaryCta?.href ?? (clinicWhatsapp || '#contacto');
  const bookExternal = primaryCta ? primaryCta.external : Boolean(clinicWhatsapp);
  /** Enlace de "reservar" que respeta el modo público de la clínica. */
  const BookLink = ({
    children,
    className,
    style,
  }: {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }) =>
    bookExternal ? (
      <a href={bookHref} target="_blank" rel="noreferrer" className={className} style={style}>
        {children}
      </a>
    ) : (
      <Link href={bookHref} className={className} style={style}>
        {children}
      </Link>
    );

  return (
    <div className="bg-surface text-text-primary">
      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(160deg, ${primary}1f, ${secondary}0f 55%, transparent)`,
        }}
      >
        {/* Trama de puntos al color de la clínica: da textura al hero sin
            competir con el texto (se desvanece hacia el centro). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(${primary}2e 1px, transparent 1px)`,
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(ellipse 80% 90% at 12% 0%, black, transparent 68%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 90% at 12% 0%, black, transparent 68%)',
          }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-10 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:pb-16">
          <div>
            {/* Estado en vivo: la clínica recibe reservas ahora mismo. */}
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-medium text-text-secondary shadow-sm">
              <span className="relative flex size-2">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden"
                  style={{ backgroundColor: accent }}
                />
                <span
                  className="relative inline-flex size-2 rounded-full"
                  style={{ backgroundColor: accent }}
                />
              </span>
              {canBookOnline
                ? 'Reservas en línea abiertas'
                : publicMode === 'WHATSAPP'
                  ? 'Reservas por WhatsApp'
                  : 'Atención con cita previa'}
            </span>

            <h1 className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
              {heroTitle}
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-lg text-text-secondary">{heroSubtitle}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {primaryCta &&
                (primaryCta.external ? (
                  <a
                    href={primaryCta.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3.5 text-lg font-bold shadow-sm transition hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: primary, color: onPrimary }}
                  >
                    <MessageCircle className="size-5" /> {primaryCta.label}
                  </a>
                ) : (
                  <Link
                    href={primaryCta.href}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3.5 text-lg font-bold shadow-sm transition hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: primary, color: onPrimary }}
                  >
                    {primaryCta.label} <ArrowRight className="size-5" />
                  </Link>
                ))}
              {/* Sin reserva online: el teléfono es la vía real de contacto, así
                  que pasa a ser la acción principal en vez de un botón muerto. */}
              {!primaryCta && tenant.whatsappContact && (
                <a
                  href={`tel:+${tenant.whatsappContact}`}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3.5 text-lg font-bold shadow-sm transition hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: primary, color: onPrimary }}
                >
                  <Phone className="size-5" /> Llamar para reservar
                </a>
              )}
              <a
                href="#especialidades"
                className={
                  primaryCta || tenant.whatsappContact
                    ? 'inline-flex items-center justify-center rounded-2xl border border-border bg-surface px-7 py-3.5 text-lg font-semibold text-text-secondary transition hover:bg-canvas active:scale-95'
                    : 'inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3.5 text-lg font-bold shadow-sm transition hover:opacity-90 active:scale-95'
                }
                style={
                  primaryCta || tenant.whatsappContact
                    ? undefined
                    : { backgroundColor: primary, color: onPrimary }
                }
              >
                Ver especialidades
              </a>
            </div>

            {/* Reserva conversacional: deep link al bot con la clínica ya
                resuelta. Solo aparece si la plataforma tiene bot configurado. */}
            {botLink && (
              <a
                href={botLink}
                target="_blank"
                rel="noreferrer"
                className="group mt-5 inline-flex items-center gap-3 rounded-2xl border border-border bg-surface py-3 pl-3 pr-4 shadow-sm transition hover:border-text-secondary/40 hover:shadow-md active:scale-[.98]"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/12 text-[#128C7E]">
                  <MessageCircle className="size-5" />
                </span>
                <span className="flex flex-col text-left">
                  <span className="text-sm font-semibold text-text-primary">
                    Reservar por WhatsApp
                  </span>
                  <span className="text-xs text-text-secondary">
                    Chatea con nuestro asistente y agenda en un minuto
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-text-secondary transition group-hover:translate-x-0.5" />
              </a>
            )}

            {/* Accesos rápidos: los servicios reales de la clínica. */}
            {services.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {services.slice(0, 4).map((svc) => (
                  <BookLink
                    key={svc.id}
                    className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-text-secondary shadow-sm transition hover:bg-canvas hover:text-text-primary"
                  >
                    {svc.name}
                  </BookLink>
                ))}
              </div>
            )}
          </div>

          {/* Visual del hero: foto de portada/fachada, o composición de marca.
              Marco de altura fija con relleno difuminado: la imagen se muestra
              entera sin importar su proporción (banner, cuadrada o vertical). */}
          {heroImage ? (
            <div className="relative hidden lg:block">
              <div
                className="absolute -right-6 -top-6 h-40 w-40 rounded-full opacity-20 blur-2xl"
                style={{ backgroundColor: secondary }}
              />
              <div className="relative h-[440px] overflow-hidden rounded-3xl border border-border shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroImage}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl"
                />
                <div className="absolute inset-0" style={{ backgroundColor: `${primary}14` }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroImage}
                  alt={tenant.name}
                  width={800}
                  height={600}
                  className="relative h-full w-full object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="relative hidden min-h-[380px] items-center justify-center lg:flex">
              {/* Composición orbital: la clínica al centro, sus especialidades alrededor. */}
              <div
                className="absolute size-72 rounded-full border"
                style={{ borderColor: `${primary}2e` }}
              />
              <div
                className="absolute size-[26rem] rounded-full border"
                style={{ borderColor: `${primary}1a` }}
              />
              <div className="relative flex flex-col items-center rounded-3xl border border-border bg-surface px-10 py-8 text-center shadow-xl">
                {tenant.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tenant.logoUrl}
                    alt={tenant.name}
                    className="h-16 w-auto max-w-[180px] object-contain"
                  />
                ) : (
                  <div
                    className="flex size-16 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: primary, color: onPrimary }}
                  >
                    <Stethoscope className="size-8" />
                  </div>
                )}
                <p className="mt-3 max-w-[220px] text-lg font-bold leading-snug">{tenant.name}</p>
              </div>
              {specialties.slice(0, 4).map(([sp], i) => {
                const pos = [
                  'left-0 top-8',
                  'right-0 top-16',
                  'bottom-10 left-6',
                  'bottom-2 right-10',
                ][i];
                return (
                  <span
                    key={sp}
                    className={`absolute ${pos} rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-text-secondary shadow-sm`}
                  >
                    {sp}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Franja de confianza: cómo funciona reservar aquí. */}
        <div className="border-t border-border bg-surface/70 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-4 text-sm text-text-secondary">
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4" style={{ color: accent }} />{' '}
              {canBookOnline ? 'Reserva online las 24 horas' : 'Atención con cita previa'}
            </span>
            <span className="inline-flex items-center gap-2">
              <MessageCircle className="size-4" style={{ color: accent }} /> Coordinación por
              WhatsApp
            </span>
            <span className="inline-flex items-center gap-2">
              <Banknote className="size-4" style={{ color: accent }} /> Pago en efectivo o QR
            </span>
          </div>
        </div>
      </section>

      {/* ── Servicios ── */}
      {services.length > 0 && (
        <section id="servicios" className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="text-balance text-3xl font-bold">{servicesTitle}</h2>
            <p className="mt-2 text-text-muted">
              Precios claros y duración definida: sabes qué esperar antes de reservar.
            </p>
          </div>
          <div className="mt-10 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {services.map((svc, i) => {
              const Icon = getServiceIcon(svc.icon, i);
              return (
                <BookLink
                  key={svc.id}
                  className="group flex items-center gap-5 p-5 transition-colors hover:bg-canvas sm:p-6"
                >
                  <span
                    className="flex size-12 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${primary}1f`, color: accent }}
                  >
                    <Icon className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{svc.name}</span>
                    {svc.description && (
                      <span className="mt-0.5 line-clamp-2 block text-sm text-text-muted">
                        {svc.description}
                      </span>
                    )}
                  </span>
                  <span className="hidden flex-shrink-0 text-right sm:block">
                    <span className="block font-semibold text-text-primary">
                      Bs {Number(svc.price).toFixed(0)}
                    </span>
                    <span className="block text-sm text-text-muted">{svc.duration} min</span>
                  </span>
                  <ArrowRight
                    className="size-5 flex-shrink-0 text-text-muted transition-transform group-hover:translate-x-1"
                    style={{ color: accent }}
                  />
                </BookLink>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Seguros aceptados ── */}
      {insurances.length > 0 && (
        <section className="bg-canvas">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:py-16">
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-md">
                <h2 className="text-balance text-2xl font-bold">Seguros aceptados</h2>
                <p className="mt-1.5 text-text-muted">
                  Si tu consulta está cubierta, eliges tu seguro al reservar y no pagas en la
                  clínica.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {insurances.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-2 rounded-full border bg-surface px-4 py-2 text-sm font-medium text-text-secondary"
                    style={{ borderColor: `${primary}3d` }}
                  >
                    <ShieldCheck className="size-4" style={{ color: accent }} /> {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Especialidades (grilla al color de la clínica) ── */}
      {specialties.length > 0 && (
        <section id="especialidades" className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="text-balance text-3xl font-bold">Especialidades</h2>
            <p className="mt-2 text-text-muted">
              Toca una especialidad para reservar con el profesional que la atiende.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {specialties.map(([sp, count]) => (
              <BookLink
                key={sp}
                className="group flex items-center justify-between gap-3 rounded-2xl px-5 py-4 font-semibold shadow-sm transition hover:opacity-90 active:scale-[.99]"
                style={{ backgroundColor: primary, color: onPrimary }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{sp}</span>
                  <span className="block text-sm font-normal opacity-75">
                    {count} {count === 1 ? 'profesional' : 'profesionales'}
                  </span>
                </span>
                <ArrowRight className="size-5 flex-shrink-0 transition-transform group-hover:translate-x-1" />
              </BookLink>
            ))}
          </div>
        </section>
      )}

      {/* ── Especialistas ── */}
      {doctors.length > 0 && (
        <section id="especialistas" className="bg-canvas">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <div className="max-w-2xl">
              <h2 className="text-balance text-3xl font-bold">{specialistsTitle}</h2>
              <p className="mt-2 text-text-muted">Profesionales listos para atenderte.</p>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {doctors.map((doctor) => (
                <div
                  key={doctor.id}
                  className="rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    {doctor.doctorProfile?.photoUrl ? (
                      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full border border-border">
                        <Image
                          src={doctor.doctorProfile.photoUrl}
                          alt={doctor.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div
                        className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold"
                        style={{ backgroundColor: primary, color: onPrimary }}
                      >
                        {initials(doctor.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text-primary">{doctor.name}</p>
                      {doctor.doctorProfile?.specialty && (
                        <p className="truncate text-sm" style={{ color: accent }}>
                          {doctor.doctorProfile.specialty}
                        </p>
                      )}
                    </div>
                  </div>
                  {doctor.doctorProfile?.bio && (
                    <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-text-secondary">
                      {doctor.doctorProfile.bio}
                    </p>
                  )}
                  {doctor.doctorServices.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {doctor.doctorServices.slice(0, 3).map((ds) => (
                        <span
                          key={ds.id}
                          className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-text-secondary"
                        >
                          {ds.service.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <BookLink
                    className="mt-5 inline-flex items-center gap-1 text-sm font-semibold transition hover:gap-2"
                    style={{ color: accent }}
                  >
                    Agendar con {shortDoctorName(doctor.name)} <ArrowRight className="size-4" />
                  </BookLink>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Instagram + galería propia (confianza social) ── */}
      <InstagramFeed
        title={`Conocé a ${tenant.name}`}
        profileUrl={tenant.instagramUrl}
        lightWidgetId={process.env.NEXT_PUBLIC_LIGHTWIDGET_ID}
        media={tenant.gallery ?? []}
      />

      {/* ── Contacto y ubicación ── */}
      {(tenant.address || waLink) && (
        <section id="contacto" className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="text-balance text-3xl font-bold">Cómo llegar y contactarnos</h2>
            <p className="mt-2 text-text-muted">
              Estamos para ayudarte antes, durante y después de tu cita.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            {/* Mapa (o fachada si no hay dirección) */}
            {mapsEmbed ? (
              <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
                <iframe
                  src={mapsEmbed}
                  title={`Ubicación de ${tenant.name}`}
                  className="h-72 w-full sm:h-full sm:min-h-[320px]"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : tenant.locationPhotoUrl ? (
              <div className="relative h-72 overflow-hidden rounded-2xl border border-border shadow-sm sm:h-auto sm:min-h-[320px]">
                <Image
                  src={tenant.locationPhotoUrl}
                  alt={`Fachada de ${tenant.name}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 640px"
                  className="object-cover"
                />
              </div>
            ) : null}

            {/* Tarjetas de contacto */}
            <div className="space-y-3">
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:border-transparent hover:shadow-md"
                >
                  <span className="flex size-11 flex-shrink-0 items-center justify-center rounded-xl bg-whatsapp/15 text-whatsapp">
                    <MessageCircle className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">WhatsApp</span>
                    <span className="block text-sm text-text-muted">
                      Respuesta directa de la clínica
                    </span>
                  </span>
                </a>
              )}
              {tenant.address && (
                <a
                  href={mapsLink ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:border-transparent hover:shadow-md"
                >
                  <span
                    className="flex size-11 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${primary}1f`, color: accent }}
                  >
                    <MapPin className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">Dirección</span>
                    <span className="block text-sm text-text-muted">{tenant.address}</span>
                  </span>
                </a>
              )}
              <BookLink className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:border-transparent hover:shadow-md">
                <span
                  className="flex size-11 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${primary}1f`, color: accent }}
                >
                  <CalendarCheck className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {canBookOnline ? 'Reserva online' : 'Reservar cita'}
                  </span>
                  <span className="block text-sm text-text-muted">
                    {canBookOnline
                      ? 'Agenda disponible las 24 horas'
                      : 'Coordina tu cita con nosotros'}
                  </span>
                </span>
              </BookLink>
            </div>
          </div>
        </section>
      )}

      {/* ── CTA final ── */}
      <section className="mx-auto max-w-6xl px-5 pb-16 sm:pb-20">
        <div
          className="relative overflow-hidden rounded-3xl px-8 py-14 text-center"
          style={{
            background: `linear-gradient(135deg, ${primary}, ${secondary})`,
            color: onPrimary,
          }}
        >
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10" />
          <div className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-white/10" />
          <div className="relative">
            <h2 className="text-balance text-3xl font-bold">{ctaTitle}</h2>
            <p className="mx-auto mt-2 max-w-md opacity-80">{ctaSubtitle}</p>
            <BookLink
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl bg-surface px-8 py-4 text-lg font-bold shadow-lg transition hover:bg-canvas active:scale-95"
              style={{ color: accent }}
            >
              Agendar mi cita <ArrowRight className="size-5" />
            </BookLink>
          </div>
        </div>
      </section>
    </div>
  );
}
