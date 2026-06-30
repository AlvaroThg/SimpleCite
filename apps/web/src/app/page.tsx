import Link from 'next/link';
import Image from 'next/image';
import { Reveal, Stagger, StaggerItem, ScrollCue } from '@/components/landing/motion';

// Número de WhatsApp de ventas (E.164 sin '+').
const WA_NUMBER = '59161869814';
const waLink = (msg: string) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
const CTA_MSG = 'Hola, quiero probar SimpleCite para mi consultorio.';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
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
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-100">
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
          <Link href="/panel/login" className="text-gray-600 hover:text-gray-900 font-medium px-2">
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
        <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight">
          Automatiza tus citas y cobra por QR{' '}
          <span className="text-brand-600">sin salir de WhatsApp.</span>
        </h1>
        <p className="mt-5 text-lg text-gray-600 max-w-xl">
          Tus pacientes reservan online, confirman por WhatsApp y pagan con QR bancario. Tu agenda
          se llena sola y reduces las inasistencias con recordatorios automáticos.
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
            className="px-7 py-3.5 rounded-2xl border border-gray-200 text-gray-700 font-semibold text-lg text-center hover:bg-gray-50 transition"
          >
            Ver cómo funciona
          </a>
        </div>
        <p className="mt-4 text-sm text-gray-400">
          Sin tarjeta de crédito · Configuración en minutos
        </p>
        <div className="mt-10 hidden lg:block">
          <ScrollCue />
        </div>
      </div>

      {/* Mockup con glow radial de marca detrás + respiración sutil. */}
      <div className="relative mx-auto">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/20 blur-[90px]"
        />
        <div className="animate-breathe">
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}

/** Mockup de celular mostrando el bot de WhatsApp (puro CSS). */
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[280px]">
      <div className="rounded-[2.5rem] border-[10px] border-gray-900 bg-gray-900 shadow-2xl overflow-hidden">
        {/* Barra superior estilo WhatsApp */}
        <div className="bg-brand-700 text-white px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm">
            🏥
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Clínica Tarija</p>
            <p className="flex items-center gap-1.5 text-[10px] text-white/70">
              <span className="animate-pulse-dot inline-block size-1.5 rounded-full bg-green-400" />
              en línea
            </p>
          </div>
        </div>
        {/* Chat */}
        <div className="bg-[#e7ded5] px-3 py-4 space-y-2 h-[420px] text-[13px]">
          <Bubble side="in">
            ¡Hola! 👋 Soy el asistente de la Clínica. ¿Con qué doctor deseas tu cita?
          </Bubble>
          <Bubble side="out">Con el Dr. Rodríguez</Bubble>
          <Bubble side="in">Genial. ¿Qué día prefieres? *1.* Hoy · *2.* Mañana</Bubble>
          <Bubble side="out">2</Bubble>
          <Bubble side="in">🕐 Horarios: *1.* 09:00 · *2.* 10:30 · *3.* 15:00</Bubble>
          <Bubble side="out">2</Bubble>
          <Bubble side="in">
            ✅ ¡Listo! Escanea el QR de pago y envíanos el comprobante.{' '}
            <span className="inline-block mt-1">📲 Bs 80</span>
          </Bubble>
        </div>
      </div>
    </div>
  );
}

function Bubble({ side, children }: { side: 'in' | 'out'; children: React.ReactNode }) {
  const isOut = side === 'out';
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${
          isOut ? 'bg-[#d9fdd3] rounded-tr-sm' : 'bg-white rounded-tl-sm'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Problema vs Solución ─────────────────────────────────────────────
function ProblemSolution() {
  return (
    <section className="bg-gray-50 border-y border-gray-100">
      <div className="max-w-6xl mx-auto px-5 py-20 grid md:grid-cols-2 gap-8">
        <Reveal className="bg-white rounded-3xl p-8 border border-gray-100">
          <span className="text-3xl">😟</span>
          <h3 className="mt-3 text-xl font-bold">Cada paciente que no asiste, es dinero perdido</h3>
          <p className="mt-3 text-gray-600 leading-relaxed">
            Las llamadas para confirmar consumen tiempo de tu recepción. Los pacientes olvidan la
            cita, no avisan, y ese horario queda vacío. Sin pago anticipado, no hay compromiso.
          </p>
        </Reveal>
        <Reveal delay={0.1} className="bg-white rounded-3xl p-8 border-2 border-brand-200">
          <span className="text-3xl">✅</span>
          <h3 className="mt-3 text-xl font-bold">SimpleCite lo resuelve por ti</h3>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li>• Recordatorios automáticos por WhatsApp → menos inasistencias.</li>
            <li>• Pago por QR bancario al reservar → compromiso real del paciente.</li>
            <li>• Confirmación instantánea → tu recepción deja de llamar.</li>
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
      t: 'Confirma y paga por QR bancario',
      d: 'Recibe el QR por WhatsApp y paga al instante. La cita queda asegurada.',
    },
    {
      n: '3',
      t: 'Tu calendario se actualiza solo',
      d: 'La agenda se llena automáticamente y todos reciben recordatorios.',
    },
  ];
  return (
    <section id="como-funciona" className="max-w-6xl mx-auto px-5 py-20">
      <h2 className="text-3xl font-bold text-center">Cómo funciona</h2>
      <p className="text-center text-gray-500 mt-2">En 3 pasos, sin complicaciones.</p>
      <Stagger className="mt-12 grid md:grid-cols-3 gap-6">
        {steps.map((s) => (
          <StaggerItem key={s.n} className="text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-600 text-white font-bold text-xl flex items-center justify-center">
              {s.n}
            </div>
            <h3 className="mt-4 font-semibold text-lg">{s.t}</h3>
            <p className="mt-2 text-gray-600 text-sm leading-relaxed">{s.d}</p>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

// ─── Testimonios ──────────────────────────────────────────────────────
function Testimonials() {
  return (
    <section className="bg-gray-50 border-y border-gray-100">
      <div className="max-w-6xl mx-auto px-5 py-20">
        <h2 className="text-3xl font-bold text-center">Lo que dicen los doctores</h2>
        <div className="mt-12 flex flex-col items-center justify-center gap-3 text-center py-10">
          <span className="text-5xl">🩺</span>
          <p className="text-lg font-semibold text-gray-700">¡No hay clientes aún!</p>
          <p className="text-gray-400 text-sm">Sé el primero.</p>
        </div>
      </div>
    </section>
  );
}

// ─── Shadcn-style primitives (pure Tailwind) ──────────────────────────

function Card({ children, featured = false }: { children: React.ReactNode; featured?: boolean }) {
  return (
    <div
      className={`relative bg-white rounded-2xl border flex flex-col ${
        featured
          ? 'border-brand-500 shadow-2xl ring-1 ring-brand-200 md:-translate-y-3'
          : 'border-gray-200 shadow-sm'
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
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
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
      checkColor: 'text-gray-400',
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
      badge: '⭐ Recomendado',
      buttonLabel: 'Obtener Profesional',
      buttonVariant: 'default' as const,
      checkColor: 'text-brand-500',
      features: [
        'Todo lo del plan Básico, más:',
        'Bot de WhatsApp Propio (Bot 24/7)',
        'Confirmaciones y recordatorios automáticos',
        'Cobro por QR estático (Cero comisiones)',
        'Recepción de comprobantes en el panel',
        'Soporte prioritario por WhatsApp',
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
      checkColor: 'text-gray-400',
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
      <p className="text-center text-gray-500 mt-2">
        Elige el que crece contigo. Precios en USD/mes.
      </p>

      <div className="mt-12 grid md:grid-cols-3 gap-6 items-start">
        {plans.map((p) => (
          <Card key={p.name} featured={p.featured}>
            <CardHeader>
              {p.badge && (
                <div className="mb-3">
                  <Badge>{p.badge}</Badge>
                </div>
              )}
              <h3 className="text-xl font-bold text-gray-900">{p.name}</h3>
              <div className="mt-1 flex items-end gap-1">
                <span className="text-4xl font-extrabold text-gray-900">${p.price}</span>
                <span className="text-gray-400 mb-1 text-sm">USD / mes</span>
              </div>
              <p className="mt-2 text-sm text-gray-500 leading-snug">{p.tagline}</p>
            </CardHeader>

            <CardContent>
              <ul className="space-y-2.5 text-sm">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {f.startsWith('Todo') ? (
                      <span className="text-gray-400 mt-0.5 font-bold">›</span>
                    ) : (
                      <span className={`${p.checkColor} mt-0.5`}>✓</span>
                    )}
                    <span
                      className={f.startsWith('Todo') ? 'text-gray-500 italic' : 'text-gray-700'}
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

      <p className="mt-6 text-center text-sm text-gray-400 italic">
        cambio dólar a bolivianos: 9.72 bs
      </p>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-6xl mx-auto px-5 py-12 flex flex-col sm:flex-row justify-between gap-6">
        <div>
          <Image
            src="/logo-full.png"
            alt="SimpleCite"
            width={2031}
            height={774}
            className="h-28 w-auto brightness-0 invert"
          />
          <p className="mt-3 text-sm text-brand-300">
            Gestiona citas. Atiende mejor. Hazlo simple.
          </p>
          <p className="mt-1 text-sm text-gray-400 max-w-xs">
            Agenda médica y cobros por WhatsApp para Bolivia.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <a
            href={waLink('Hola, tengo una consulta sobre SimpleCite.')}
            className="hover:text-white"
          >
            Contacto por WhatsApp
          </a>
          <Link href="/panel/login" className="hover:text-white">
            Ingresar al panel
          </Link>
          <a href="#precios" className="hover:text-white">
            Precios
          </a>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} SimpleCite · Tarija, Bolivia
      </div>
    </footer>
  );
}
