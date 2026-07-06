'use client';

import Script from 'next/script';
import { ArrowUpRight } from 'lucide-react';

/** Glifo de Instagram (lucide quitó los íconos de marca en v1). */
function IgGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export interface GalleryMediaItem {
  url: string;
  type: 'IMAGE' | 'VIDEO';
}

interface InstagramFeedProps {
  /** Título de la sección. */
  title?: string;
  /** URL del perfil de Instagram (encabezado + fallback). */
  profileUrl?: string | null;
  /**
   * ID del widget de LightWidget (lightwidget.com). Es la vía recomendada:
   * embebe un iframe, sin que scripts de terceros corran en tu página.
   */
  lightWidgetId?: string;
  /** Alternativa: ID de app de Elfsight (requiere cargar su script). */
  elfsightAppId?: string;
  /** Galería propia de la clínica (carrusel infinito de fotos/videos). */
  media?: GalleryMediaItem[];
}

/**
 * Feed de Instagram para la landing del tenant SIN usar la API oficial de Meta
 * ni scraping: se apoya en un generador de widgets gratuito (LightWidget o
 * Elfsight). Si no hay widget configurado, degrada a un CTA al perfil.
 */
export function InstagramFeed({
  title = 'Síguenos en Instagram',
  profileUrl,
  lightWidgetId,
  elfsightAppId,
  media = [],
}: InstagramFeedProps) {
  const hasWidget = Boolean(lightWidgetId || elfsightAppId);
  // Sin widget, perfil ni galería propia no hay nada que mostrar.
  if (!hasWidget && !profileUrl && media.length === 0) return null;

  return (
    <section id="instagram" className="bg-white">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <IgGlyph className="size-6" />
          </span>
          <h2 className="text-3xl font-bold text-balance">{title}</h2>
          <p className="max-w-md text-gray-500">
            Mirá nuestro día a día, casos y novedades antes de reservar.
          </p>

          {/* Carrusel infinito con la galería propia de la clínica */}
          {media.length > 0 && <MediaMarquee media={media} />}

          {profileUrl && (
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              Ver perfil <ArrowUpRight className="size-4" />
            </a>
          )}
        </div>

        {(hasWidget || media.length === 0) && (
          <div className="mt-10">
            {lightWidgetId ? (
              <LightWidget id={lightWidgetId} />
            ) : elfsightAppId ? (
              <Elfsight appId={elfsightAppId} />
            ) : profileUrl ? (
              <ProfileFallback profileUrl={profileUrl} />
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Carrusel infinito (marquee CSS): la pista se duplica y se desplaza en loop;
 * se pausa al pasar el mouse y cada foto/video se agranda suavemente al
 * hacer hover para apreciarlo mejor. Con prefers-reduced-motion la pista no se
 * anima y queda como scroll horizontal manual.
 */
function MediaMarquee({ media }: { media: GalleryMediaItem[] }) {
  // Repetir hasta llenar cómodo el ancho (mínimo 6 elementos por vuelta).
  const base =
    media.length >= 6
      ? media
      : Array(Math.ceil(6 / media.length))
          .fill(media)
          .flat();
  const track = [...base, ...base]; // dos vueltas → el -50% empalma perfecto

  return (
    <div className="group/marquee relative mt-6 w-full overflow-hidden motion-reduce:overflow-x-auto">
      {/* Degradados laterales para que el loop no corte en seco */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white to-transparent" />

      <div className="flex w-max animate-sc-marquee gap-4 py-3 group-hover/marquee:[animation-play-state:paused] motion-reduce:animate-none">
        {track.map((m, i) => (
          <div
            key={`${m.url}-${i}`}
            className="relative h-44 w-64 flex-shrink-0 overflow-hidden rounded-2xl border border-gray-100 shadow-sm transition-transform duration-300 ease-out hover:z-10 hover:scale-[1.07] hover:shadow-lg sm:h-52 sm:w-80"
          >
            {m.type === 'VIDEO' ? (
              <video
                src={m.url}
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
                className="h-full w-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** LightWidget: iframe + script oficial (solo redimensiona el iframe). */
function LightWidget({ id }: { id: string }) {
  return (
    <>
      <iframe
        src={`https://lightwidget.com/widgets/${id}.html`}
        title="Instagram"
        scrolling="no"
        allowTransparency
        className="lightwidget-widget w-full overflow-hidden rounded-2xl border-0"
        style={{ width: '100%', border: 0, minHeight: 320 }}
      />
      <Script src="https://lightwidget.com/widgets/lightwidget.js" strategy="lazyOnload" />
    </>
  );
}

/** Elfsight: requiere su script de plataforma + un div con la clase de la app. */
function Elfsight({ appId }: { appId: string }) {
  return (
    <>
      <Script src="https://elfsightcdn.com/platform.js" strategy="lazyOnload" />
      <div className={`elfsight-app-${appId}`} data-elfsight-app-lazy />
    </>
  );
}

/** Sin widget configurado: tarjeta-CTA al perfil. */
function ProfileFallback({ profileUrl }: { profileUrl: string }) {
  return (
    <a
      href={profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-6 py-10 text-center transition hover:border-brand-200 hover:bg-white"
    >
      <IgGlyph className="size-8 text-brand-600" />
      <span className="font-semibold text-gray-900">Visitá nuestro Instagram</span>
      <span className="text-sm text-gray-500">Fotos, novedades y testimonios reales.</span>
    </a>
  );
}
