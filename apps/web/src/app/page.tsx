import Link from 'next/link';
import Image from 'next/image';

// Número de WhatsApp de ventas (reemplazar por el real, E.164 sin '+').
const WA_NUMBER = '59170000000';
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
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <Image
          src="/logo.png"
          alt="SimpleCite"
          width={2031}
          height={774}
          priority
          className="h-8 w-auto"
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
          Tus pacientes reservan online, confirman por WhatsApp y pagan con QR Simple. Tu agenda se
          llena sola y reduces las inasistencias con recordatorios automáticos.
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
      </div>

      <PhoneMockup />
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
            <p className="text-[10px] text-white/70">en línea</p>
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
            ✅ ¡Listo! Para confirmar, paga con este QR 👇{' '}
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
        <div className="bg-white rounded-3xl p-8 border border-gray-100">
          <span className="text-3xl">😟</span>
          <h3 className="mt-3 text-xl font-bold">Cada paciente que no asiste, es dinero perdido</h3>
          <p className="mt-3 text-gray-600 leading-relaxed">
            Las llamadas para confirmar consumen tiempo de tu recepción. Los pacientes olvidan la
            cita, no avisan, y ese horario queda vacío. Sin pago anticipado, no hay compromiso.
          </p>
        </div>
        <div className="bg-white rounded-3xl p-8 border-2 border-brand-200">
          <span className="text-3xl">✅</span>
          <h3 className="mt-3 text-xl font-bold">SimpleCite lo resuelve por ti</h3>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li>• Recordatorios automáticos por WhatsApp → menos inasistencias.</li>
            <li>• Pago por QR Simple al reservar → compromiso real del paciente.</li>
            <li>• Confirmación instantánea → tu recepción deja de llamar.</li>
          </ul>
        </div>
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
      t: 'Confirma y paga por QR Simple',
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
      <div className="mt-12 grid md:grid-cols-3 gap-6">
        {steps.map((s) => (
          <div key={s.n} className="text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-600 text-white font-bold text-xl flex items-center justify-center">
              {s.n}
            </div>
            <h3 className="mt-4 font-semibold text-lg">{s.t}</h3>
            <p className="mt-2 text-gray-600 text-sm leading-relaxed">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Testimonios ──────────────────────────────────────────────────────
function Testimonials() {
  const items = [
    {
      q: 'Reduje las inasistencias casi a la mitad. Los pacientes pagan al reservar y ya no faltan.',
      a: 'Dra. Mariana Fernández',
      r: 'Ginecología · Tarija',
    },
    {
      q: 'Mi recepcionista dejó de pasar el día llamando para confirmar. Todo es por WhatsApp.',
      a: 'Dr. Luis Vargas',
      r: 'Fisioterapia · Santa Cruz',
    },
    {
      q: 'Configurarlo fue rapidísimo y mis pacientes lo usan sin que les explique nada.',
      a: 'Dr. Andrés Quispe',
      r: 'Odontología · La Paz',
    },
  ];
  return (
    <section className="bg-gray-50 border-y border-gray-100">
      <div className="max-w-6xl mx-auto px-5 py-20">
        <h2 className="text-3xl font-bold text-center">Lo que dicen los doctores</h2>
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {items.map((t) => (
            <figure key={t.a} className="bg-white rounded-3xl p-6 border border-gray-100">
              <div className="text-brand-500 text-xl">★★★★★</div>
              <blockquote className="mt-3 text-gray-700 leading-relaxed">“{t.q}”</blockquote>
              <figcaption className="mt-4 text-sm">
                <span className="font-semibold text-gray-900">{t.a}</span>
                <span className="block text-gray-400">{t.r}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────
function Pricing() {
  const plans = [
    {
      name: 'Básico',
      price: '15',
      tagline: 'Médicos recién graduados',
      featured: false,
      features: [
        'Agenda web (booking público)',
        'Sin bot de WhatsApp',
        'Recordatorios manuales',
        'Soporte por correo (48 hrs)',
        'Diseño básico',
      ],
    },
    {
      name: 'Pro',
      price: '35',
      tagline: 'Consultorios y especialistas',
      featured: true,
      features: [
        'Agenda web (booking público)',
        'Bot de WhatsApp (QR / Baileys)',
        'Recordatorios automáticos',
        'Soporte por chat prioritario',
        'Diseño destacado',
      ],
    },
    {
      name: 'Élite',
      price: '99',
      tagline: 'Clínicas de múltiples especialidades',
      featured: false,
      features: [
        'Agenda web (booking público)',
        'WhatsApp con API oficial de Meta',
        'Recordatorios automáticos + plantillas',
        'Ejecutivo de cuenta asignado',
        'Diseño premium',
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
          <div
            key={p.name}
            className={`rounded-3xl p-7 border bg-white relative ${
              p.featured
                ? 'border-brand-500 shadow-xl md:-translate-y-3 ring-1 ring-brand-200'
                : 'border-gray-200'
            }`}
          >
            {p.featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                Más Popular
              </span>
            )}
            <h3 className="text-lg font-bold">{p.name}</h3>
            <p className="text-sm text-gray-500 h-10">{p.tagline}</p>
            <div className="mt-2 flex items-end gap-1">
              <span className="text-4xl font-extrabold">${p.price}</span>
              <span className="text-gray-400 mb-1">/mes</span>
            </div>
            <ul className="mt-6 space-y-2.5 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="text-brand-500 mt-0.5">✓</span>
                  <span className="text-gray-700">{f}</span>
                </li>
              ))}
            </ul>
            <a
              href={waLink(`Hola, me interesa el plan ${p.name} de SimpleCite.`)}
              className={`mt-7 block text-center px-5 py-3 rounded-2xl font-semibold transition ${
                p.featured
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Empezar con {p.name}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-6xl mx-auto px-5 py-12 flex flex-col sm:flex-row justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <Image
              src="/icon.png"
              alt=""
              width={1254}
              height={1254}
              className="w-7 h-7 rounded-lg"
            />
            <span className="text-lg font-bold text-white">
              Simple<span className="text-brand-400">Cite</span>
            </span>
          </div>
          <p className="mt-2 text-sm text-brand-300">
            Gestiona citas. Atiende mejor. Hazlo simple.
          </p>
          <p className="mt-2 text-sm text-gray-400 max-w-xs">
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
