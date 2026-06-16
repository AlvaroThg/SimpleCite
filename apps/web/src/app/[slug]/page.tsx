import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, CalendarCheck, MessageCircle, Clock, ArrowRight } from 'lucide-react';
import { getTenantInfo, getDoctors } from '@/lib/api';
import { getServiceIcon } from '@/lib/service-icons';
import { readableOn, accentOn } from '@/lib/tenant-color';
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

  // Servicios únicos agregados desde los doctores (conserva el ícono).
  const services = Array.from(
    new Map(
      doctors.flatMap((d) => d.doctorServices.map((ds) => [ds.service.name, ds.service])),
    ).values(),
  );

  // Textos editables con fallbacks por defecto.
  const heroTitle = tenant.heroTitle || `Tu salud, agendada en minutos en ${tenant.name}`;
  const heroSubtitle =
    tenant.heroSubtitle ||
    'Reserva tu cita en línea con nuestros especialistas. Sin llamadas, sin esperas: elige, confirma por WhatsApp y listo.';
  const servicesTitle = tenant.servicesTitle || 'Nuestros servicios';
  const specialistsTitle = tenant.specialistsTitle || 'Nuestros especialistas';
  const ctaTitle = tenant.ctaTitle || '¿Listo para tu cita?';
  const ctaSubtitle =
    tenant.ctaSubtitle || `Reserva en menos de un minuto. Te esperamos en ${tenant.name}.`;

  const stats = [
    { value: `${doctors.length}`, label: doctors.length === 1 ? 'Especialista' : 'Especialistas' },
    { value: `${services.length}`, label: services.length === 1 ? 'Servicio' : 'Servicios' },
    { value: '24/7', label: 'Reserva online' },
    { value: 'WhatsApp', label: 'Recordatorios' },
  ];

  return (
    <div className="bg-white text-gray-900">
      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${primary}14, ${secondary}0d 60%, #ffffff)` }}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:py-24 lg:grid-cols-2">
          <div>
            <span
              className="mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: `${primary}1f`, color: accent }}
            >
              <ShieldCheck className="size-3.5" /> Atención médica de confianza
            </span>
            <h1 className="text-balance text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              {heroTitle}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-gray-600">{heroSubtitle}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/${slug}/booking`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3.5 text-lg font-bold text-white shadow-sm transition hover:opacity-90 active:scale-95"
                style={{ backgroundColor: primary, color: onPrimary }}
              >
                Reservar cita <ArrowRight className="size-5" />
              </Link>
              <a
                href="#especialistas"
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 px-7 py-3.5 text-lg font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-95"
              >
                Ver especialistas
              </a>
            </div>
          </div>

          {/* Imagen de hero personalizada, o panel decorativo por defecto */}
          {tenant.heroImageUrl ? (
            <div className="relative hidden lg:block">
              <div
                className="absolute -right-6 -top-6 h-40 w-40 rounded-full opacity-20 blur-2xl"
                style={{ backgroundColor: secondary }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tenant.heroImageUrl}
                alt={tenant.name}
                width={800}
                height={600}
                className="relative max-h-[440px] w-full rounded-3xl object-cover shadow-xl"
              />
            </div>
          ) : (
            <div className="relative hidden lg:block">
              <div
                className="absolute -right-6 -top-6 h-40 w-40 rounded-full opacity-20 blur-2xl"
                style={{ backgroundColor: secondary }}
              />
              <div className="relative rounded-3xl border border-gray-100 bg-white/70 p-8 shadow-xl backdrop-blur">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-2xl text-white"
                  style={{ backgroundColor: primary, color: onPrimary }}
                >
                  <CalendarCheck className="size-8" />
                </div>
                <p className="mt-5 text-xl font-bold">Reserva 100% online</p>
                <p className="mt-1 text-gray-500">
                  Agenda disponible en tiempo real. Recibe tu confirmación y recordatorios por
                  WhatsApp.
                </p>
                <div className="mt-6 space-y-3">
                  {[
                    { icon: Clock, text: 'Disponibilidad al instante' },
                    { icon: MessageCircle, text: 'Confirmación por WhatsApp' },
                    { icon: ShieldCheck, text: 'Tus datos protegidos' },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-3 text-sm text-gray-700">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${primary}1f`, color: accent }}
                      >
                        <Icon className="size-4" />
                      </span>
                      {text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Banda de stats */}
        <div className="mx-auto max-w-6xl px-5 pb-12">
          <div className="grid grid-cols-2 gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-extrabold" style={{ color: accent }}>
                  {s.value}
                </p>
                <p className="mt-1 text-sm text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Servicios ── */}
      {services.length > 0 && (
        <section id="servicios" className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-balance">{servicesTitle}</h2>
            <p className="mt-2 text-gray-500">Atención profesional para lo que necesitas.</p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((svc, i) => {
              const Icon = getServiceIcon(svc.icon, i);
              return (
                <Link
                  key={svc.id}
                  href={`/${slug}/booking`}
                  className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${primary}1f`, color: accent }}
                  >
                    <Icon className="size-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{svc.name}</h3>
                  {svc.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500">{svc.description}</p>
                  )}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">
                      Bs {Number(svc.price).toFixed(0)} · {svc.duration} min
                    </span>
                    <span
                      className="inline-flex items-center gap-1 text-sm font-medium opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ color: accent }}
                    >
                      Reservar <ArrowRight className="size-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Instagram (confianza social, debajo de Servicios) ── */}
      <InstagramFeed
        title={`Conocé a ${tenant.name}`}
        profileUrl={tenant.instagramUrl}
        lightWidgetId={process.env.NEXT_PUBLIC_LIGHTWIDGET_ID}
      />

      {/* ── Especialistas ── */}
      {doctors.length > 0 && (
        <section id="especialistas" className="bg-gray-50">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-balance">{specialistsTitle}</h2>
              <p className="mt-2 text-gray-500">Profesionales listos para atenderte.</p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {doctors.map((doctor) => (
                <div
                  key={doctor.id}
                  className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
                      style={{ backgroundColor: primary, color: onPrimary }}
                    >
                      {initials(doctor.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{doctor.name}</p>
                      {doctor.doctorProfile?.specialty && (
                        <p className="truncate text-sm" style={{ color: accent }}>
                          {doctor.doctorProfile.specialty}
                        </p>
                      )}
                    </div>
                  </div>
                  {doctor.doctorProfile?.bio && (
                    <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-gray-600">
                      {doctor.doctorProfile.bio}
                    </p>
                  )}
                  {doctor.doctorServices.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {doctor.doctorServices.slice(0, 3).map((ds) => (
                        <span
                          key={ds.id}
                          className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
                        >
                          {ds.service.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <Link
                    href={`/${slug}/booking`}
                    className="mt-5 inline-flex items-center gap-1 text-sm font-semibold transition hover:gap-2"
                    style={{ color: accent }}
                  >
                    Agendar con {doctor.name.split(' ')[0]} <ArrowRight className="size-4" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA final ── */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
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
            <h2 className="text-3xl font-bold text-balance">{ctaTitle}</h2>
            <p className="mx-auto mt-2 max-w-md opacity-80">{ctaSubtitle}</p>
            <Link
              href={`/${slug}/booking`}
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-8 py-4 text-lg font-bold shadow-lg transition hover:bg-gray-50 active:scale-95"
              style={{ color: accent }}
            >
              Agendar mi cita <ArrowRight className="size-5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
