import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Términos del Servicio — SimpleCite',
  description: 'Condiciones de uso de la plataforma SimpleCite para clínicas y pacientes.',
};

/** Términos del servicio de la plataforma (versión inicial, sobria y honesta). */
export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-sm text-text-muted">
        <Link href="/" className="hover:text-text-primary">
          SimpleCite
        </Link>{' '}
        · Última actualización: julio de 2026
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-text-primary">
        Términos del Servicio
      </h1>

      <Section title="El servicio">
        SimpleCite provee a clínicas y consultorios en Bolivia una plataforma de agenda en línea,
        gestión de pacientes y coordinación de cobros (efectivo o QR bancario), incluyendo reservas
        por la web y por canales de mensajería como WhatsApp.
      </Section>

      <Section title="Reservas y pagos">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            La cita se considera un compromiso entre el paciente y la clínica; SimpleCite es el
            intermediario tecnológico.
          </li>
          <li>
            Los pagos por QR son transferencias directas a la cuenta bancaria de la clínica.
            SimpleCite no custodia dinero: las devoluciones, saldos a favor o disputas de pago se
            resuelven directamente con la clínica.
          </li>
          <li>
            La clínica puede reprogramar o cancelar citas; el paciente puede cancelar por los
            canales habilitados.
          </li>
        </ul>
      </Section>

      <Section title="Responsabilidades de la clínica">
        La clínica es responsable de la veracidad de su información (servicios, precios, horarios),
        del contenido clínico que registra y del cumplimiento de sus obligaciones profesionales y
        legales con sus pacientes.
      </Section>

      <Section title="Uso aceptable">
        No está permitido usar la plataforma para enviar spam, suplantar identidades, o cargar
        contenido ilegal u ofensivo. Podemos suspender cuentas que incumplan estos términos.
      </Section>

      <Section title="Disponibilidad">
        Trabajamos para mantener el servicio disponible y respaldado, pero no garantizamos
        disponibilidad ininterrumpida. Las suscripciones de las clínicas se gestionan según su plan
        contratado.
      </Section>

      <Section title="Privacidad">
        El tratamiento de datos personales se rige por nuestra{' '}
        <Link href="/privacidad" className="font-medium text-text-secondary underline">
          Política de Privacidad
        </Link>
        .
      </Section>

      <p className="mt-10 border-t border-border pt-6 text-sm text-text-muted">
        ¿Dudas? Escríbenos a soporte@simplecite.lat
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-text-primary">{title}</h2>
      <div className="mt-2 text-text-secondary">{children}</div>
    </section>
  );
}
