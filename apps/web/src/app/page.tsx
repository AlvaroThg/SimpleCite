import Link from 'next/link';
import Image from 'next/image';
import {
  CalendarX2,
  ShieldCheck,
  Stethoscope,
  Check,
  MessageCircle,
  Star,
  ChevronRight,
} from 'lucide-react';
import { Reveal, Stagger, StaggerItem, ScrollCue } from '@/components/landing/motion';
import { IPhoneMockup } from '@/components/landing/IPhoneMockup';

// Número de WhatsApp de ventas (E.164 sin '+').
const WA_NUMBER = '59161869814';
const waLink = (msg: string) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
const CTA_MSG = 'Hola, quiero probar SimpleCite para mi consultorio.';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <Nav />
      <Hero />
      <ProblemSolution />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <Footer />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-5 h-24 flex items-center justify-between">
        <Image
          src="/logo.png"
          alt="SimpleCite"
          width={2031}
          height={774}
          priority
          className="h-20 w-auto"
        />
        <nav className="flex items-center gap-3 text-sm">
          <Link
            href="/panel/login"
            className="text-text-secondary hover:text-text-primary font-medium px-2"
          >
            Ingresar
          </Link>
          <a
            href={waLink(CTA_MSG)}
            className="px-4 py-2 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 transition"
          >
            Prueba Gratis
          </a>
        </nav>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="max-w-6xl mx-auto px-5 pt-16 pb-20 sm:pt-24 grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <span className="inline-block text-xs font-semibold text-brand-700 bg-brand-50 rounded-full px-3 py-1 mb-5">
          Hecho para clínicas y consultorios en Bolivia 🇧🇴
        </span>
        <h1 className="text-4xl sm:text-[56px] font-extrabold leading-[1.05] tracking-[-0.03em] text-text-primary">
          Tu agenda médica, <span className="text-brand-600">sin inasistencias.</span>
        </h1>
        <p className="mt-5 text-lg text-text-secondary max-w-xl">
          Tus pacientes reservan en línea y pagan por adelantado con QR bancario. El pago anticipado
          asegura el compromiso y tu equipo gestiona todo desde un panel que entiende en cinco
          minutos.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <a
            href={waLink(CTA_MSG)}
            className="px-7 py-3.5 rounded-2xl bg-brand-600 text-white font-bold text-lg text-center shadow-sm hover:bg-brand-700 active:scale-95 transition"
          >
            Empieza Ahora
          </a>
          <a
            href="#como-funciona"
            className="px-7 py-3.5 rounded-2xl border border-border text-text-secondary font-semibold text-lg text-center hover:bg-canvas transition"
          >
            Ver cómo funciona
          </a>
        </div>
        <p className="mt-4 text-sm text-text-muted">
          Sin tarjeta de crédito · Configuración en minutos
        </p>
        <div className="mt-10 hidden lg:block">
          <ScrollCue />
        </div>
      </div>

      {/* iPhone con el panel de citas: muestra el valor para la clínica. */}
      <div className="mt-8 lg:mt-0">
        <IPhoneMockup />
      </div>
    </section>
  );
}

// ─── Problema vs Solución ─────────────────────────────────────────────
function ProblemSolution() {
  return (
    <section className="bg-canvas border-y border-border">
      <div className="max-w-6xl mx-auto px-5 py-20 grid md:grid-cols-2 gap-8">
        <Reveal className="bg-surface rounded-3xl p-8 border border-border">
          <div className="flex size-11 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <CalendarX2 className="size-6" />
          </div>
          <h3 className="mt-4 text-xl font-bold">Cada paciente que no asiste, es dinero perdido</h3>
          <p className="mt-3 text-text-secondary leading-relaxed">
            Las llamadas para confirmar consumen tiempo de tu recepción. Los pacientes olvidan la
            cita, no avisan, y ese horario queda vacío. Sin pago anticipado, no hay compromiso.
          </p>
        </Reveal>
        <Reveal delay={0.1} className="bg-surface rounded-3xl p-8 border-2 border-brand-200">
          <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ShieldCheck className="size-6" />
          </div>
          <h3 className="mt-4 text-xl font-bold">SimpleCite lo resuelve por ti</h3>
          <ul className="mt-4 space-y-2.5 text-text-secondary">
            {[
              'Reserva en línea 24/7 → el paciente elige doctor, servicio y horario.',
              'Pago por QR bancario al reservar → compromiso real del paciente.',
              'Panel para todo el equipo → agenda, pacientes e historias en un solo lugar.',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 flex-none text-success" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Cómo funciona ────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      n: '1',
      t: 'Tu paciente reserva en tu web',
      d: 'Elige doctor, servicio y horario desde tu página, en su celular.',
    },
    {
      n: '2',
      t: 'Paga por QR bancario',
      d: 'Escanea el QR de tu banco y paga al instante. La cita queda asegurada.',
    },
    {
      n: '3',
      t: 'Tu calendario se actualiza solo',
      d: 'La agenda se llena automáticamente y tu equipo la ve en tiempo real.',
    },
  ];
  return (
    <section id="como-funciona" className="max-w-6xl mx-auto px-5 py-20">
      <h2 className="text-3xl font-bold text-center">Cómo funciona</h2>
      <p className="text-center text-text-muted mt-2">En 3 pasos, sin complicaciones.</p>
      <Stagger className="mt-12 grid md:grid-cols-3 gap-6">
        {steps.map((s) => (
          <StaggerItem key={s.n} className="text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-600 text-white font-bold text-xl flex items-center justify-center">
              {s.n}
            </div>
            <h3 className="mt-4 font-semibold text-lg">{s.t}</h3>
            <p className="mt-2 text-text-secondary text-sm leading-relaxed">{s.d}</p>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

// ─── Testimonios ──────────────────────────────────────────────────────
function Testimonials() {
  return (
    <section className="bg-canvas border-y border-border">
      <div className="max-w-6xl mx-auto px-5 py-20">
        <h2 className="text-3xl font-bold text-center">Lo que dicen los doctores</h2>
        <div className="mt-12 flex flex-col items-center justify-center gap-3 text-center py-10">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-text-muted">
            <Stethoscope className="size-7" />
          </div>
          <p className="text-lg font-semibold text-text-secondary">¡No hay clientes aún!</p>
          <p className="text-text-muted text-sm">Sé el primero.</p>
        </div>
      </div>
    </section>
  );
}

// ─── Shadcn-style primitives (pure Tailwind) ──────────────────────────

function Card({ children, featured = false }: { children: React.ReactNode; featured?: boolean }) {
  return (
    <div
      className={`relative bg-surface rounded-2xl border flex flex-col ${
        featured
          ? 'border-brand-500 shadow-2xl ring-1 ring-brand-200 md:-translate-y-3'
          : 'border-border shadow-sm'
      }`}
    >
      {children}
    </div>
  );
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="px-6 pt-6 pb-2">{children}</div>;
}

function CardContent({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-4 flex-1">{children}</div>;
}

function CardFooter({ children }: { children: React.ReactNode }) {
  return <div className="px-6 pb-6 pt-2">{children}</div>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-100 text-brand-700 border border-brand-200 px-3 py-1 text-xs font-semibold">
      {children}
    </span>
  );
}

function Button({
  href,
  variant = 'default',
  children,
}: {
  href: string;
  variant?: 'default' | 'outline' | 'secondary';
  children: React.ReactNode;
}) {
  const styles = {
    default: 'bg-brand-600 text-white hover:bg-brand-700',
    outline: 'border border-border-strong text-text-secondary hover:bg-canvas',
    secondary: 'bg-muted text-text-secondary hover:bg-muted',
  };
  return (
    <a
      href={href}
      className={`block w-full text-center px-5 py-3 rounded-xl font-semibold text-sm transition ${styles[variant]}`}
    >
      {children}
    </a>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────
function Pricing() {
  const plans = [
    {
      name: 'Básico',
      price: '15',
      tagline: 'Ideal para consultorios individuales que recién digitalizan su agenda.',
      featured: false,
      badge: null,
      buttonLabel: 'Obtener Básico',
      buttonVariant: 'outline' as const,
      checkColor: 'text-text-muted',
      features: [
        'Agenda digital en la nube',
        'Web Booking público (Subdominio propio)',
        'Gestión de historias clínicas (EHR) básicas',
        'Cobros físicos en clínica',
        'Soporte por correo electrónico',
      ],
    },
    {
      name: 'Profesional',
      price: '35',
      tagline: 'Todo lo que necesitas para automatizar tu clínica y evitar inasistencias.',
      featured: true,
      badge: 'Recomendado',
      buttonLabel: 'Obtener Profesional',
      buttonVariant: 'default' as const,
      checkColor: 'text-brand-500',
      features: [
        'Todo lo del plan Básico, más:',
        'Cobro por QR estático (Cero comisiones)',
        'Confirmación de pago manual desde el panel',
        'Reportes de ingresos por doctor',
        'Bot de WhatsApp Propio (próximamente)',
        'Recordatorios automáticos (próximamente)',
      ],
    },
    {
      name: 'Clínica',
      price: '75',
      tagline: 'Para centros médicos con múltiples especialistas y secretarias.',
      featured: false,
      badge: null,
      buttonLabel: 'Obtener Clínica',
      buttonVariant: 'secondary' as const,
      checkColor: 'text-text-muted',
      features: [
        'Todo lo del plan Profesional, más:',
        'Multiusuario (Cuentas para Doctores y Staff)',
        'Asignación de citas por especialista',
        'Reportes avanzados de asistencia',
        'Onboarding personalizado (Videollamada)',
      ],
    },
  ];

  return (
    <section id="precios" className="max-w-6xl mx-auto px-5 py-20">
      <h2 className="text-3xl font-bold text-center">Planes simples, sin sorpresas</h2>
      <p className="text-center text-text-muted mt-2">
        Elige el que crece contigo. Precios en USD/mes.
      </p>

      <div className="mt-12 grid md:grid-cols-3 gap-6 items-start">
        {plans.map((p) => (
          <Card key={p.name} featured={p.featured}>
            <CardHeader>
              {p.badge && (
                <div className="mb-3">
                  <Badge>
                    <Star className="size-3 fill-current" /> {p.badge}
                  </Badge>
                </div>
              )}
              <h3 className="text-xl font-bold text-text-primary">{p.name}</h3>
              <div className="mt-1 flex items-end gap-1">
                <span className="text-4xl font-extrabold text-text-primary">${p.price}</span>
                <span className="text-text-muted mb-1 text-sm">USD / mes</span>
              </div>
              <p className="mt-2 text-sm text-text-muted leading-snug">{p.tagline}</p>
            </CardHeader>

            <CardContent>
              <ul className="space-y-2.5 text-sm">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {f.startsWith('Todo') ? (
                      <ChevronRight className="mt-0.5 size-4 flex-none text-text-muted" />
                    ) : (
                      <Check className={`mt-0.5 size-4 flex-none ${p.checkColor}`} />
                    )}
                    <span
                      className={
                        f.startsWith('Todo') ? 'text-text-muted italic' : 'text-text-secondary'
                      }
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter>
              <Button
                href={waLink(`Hola, quiero más información sobre el Plan ${p.name} de SimpleCite.`)}
                variant={p.buttonVariant}
              >
                {p.buttonLabel}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-center text-sm text-text-muted italic">
        cambio dólar a bolivianos: 9.72 bs
      </p>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-gray-900 text-white/60">
      <div className="max-w-6xl mx-auto px-5 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Marca */}
          <div className="lg:col-span-2">
            <Image
              src="/logo-full.png"
              alt="SimpleCite"
              width={2031}
              height={774}
              className="h-16 w-auto brightness-0 invert"
            />
            <p className="mt-4 max-w-xs text-sm text-white/50">
              Agenda médica y cobro por QR para clínicas y consultorios en Bolivia.
            </p>
          </div>

          {/* Producto */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Producto</p>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <a href="#como-funciona" className="transition-colors hover:text-white">
                  Cómo funciona
                </a>
              </li>
              <li>
                <a href="#precios" className="transition-colors hover:text-white">
                  Precios
                </a>
              </li>
              <li>
                <Link href="/panel/login" className="transition-colors hover:text-white">
                  Ingresar al panel
                </Link>
              </li>
            </ul>
          </div>

          {/* Soporte */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Soporte</p>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <a
                  href={waLink('Hola, tengo una consulta sobre SimpleCite.')}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
                >
                  <MessageCircle className="size-4" /> Contacta a soporte
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} SimpleCite · Tarija, Bolivia</span>
          <span className="text-brand-300">Gestiona citas. Atiende mejor. Hazlo simple.</span>
        </div>
      </div>
    </footer>
  );
}
