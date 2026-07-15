import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Política de Privacidad — SimpleCite',
  description:
    'Cómo SimpleCite recolecta, usa y protege los datos de pacientes y clínicas en Bolivia.',
};

/**
 * Política de privacidad de la plataforma. Requisito para operar el bot de
 * WhatsApp (Meta exige una URL pública de privacidad para activar la app) y
 * buena práctica para un SaaS que maneja datos de salud.
 */
export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-sm text-text-muted">
        <Link href="/" className="hover:text-text-primary">
          SimpleCite
        </Link>{' '}
        · Última actualización: julio de 2026
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-text-primary">
        Política de Privacidad
      </h1>
      <p className="mt-4 text-text-secondary">
        SimpleCite es una plataforma de agenda y cobros para clínicas, consultorios y centros de
        salud en Bolivia. Esta política explica qué datos tratamos, para qué y con qué cuidados,
        tanto para los pacientes que reservan citas como para el personal de las clínicas que usan
        el panel.
      </p>

      <Section title="Qué datos recolectamos">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>De pacientes</strong>: nombre completo, número de teléfono (o identificador del
            chat si reservas por WhatsApp/Telegram), cédula de identidad (opcional, para
            identificarte como paciente recurrente o validar seguros), y los datos de tus citas
            (especialista, servicio, fecha, método de pago y comprobantes que envíes).
          </li>
          <li>
            <strong>De clínicas y su personal</strong>: nombre, correo, rol y la información de
            marca y configuración que la clínica carga en su panel.
          </li>
          <li>
            <strong>Historia clínica</strong>: las notas y registros médicos son creados y
            gestionados por la clínica que te atiende; SimpleCite los almacena de forma aislada por
            clínica y solo el personal clínico autorizado de esa clínica puede acceder a ellos.
          </li>
        </ul>
      </Section>

      <Section title="Para qué los usamos">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Agendar, confirmar, reprogramar y cancelar citas.</li>
          <li>Coordinar pagos (efectivo o QR bancario) y registrar comprobantes.</li>
          <li>Enviarte confirmaciones y avisos de tus citas por el canal en que reservaste.</li>
          <li>Darle a la clínica métricas operativas de su propia actividad.</li>
        </ul>
        <p className="mt-3">
          No vendemos tus datos ni los compartimos con terceros con fines publicitarios.
        </p>
      </Section>

      <Section title="Canales de mensajería">
        Si reservas o recibes avisos por WhatsApp, la conversación viaja por la plataforma de Meta
        (WhatsApp Business) y está sujeta también a las políticas de Meta. SimpleCite solo procesa
        el contenido necesario para gestionar tu cita.
      </Section>

      <Section title="Dónde se almacenan">
        Los datos se guardan en servidores administrados por SimpleCite y las imágenes (logos,
        comprobantes de pago, fotos de la clínica) en almacenamiento en la nube de Cloudflare. El
        acceso está aislado por clínica: una clínica nunca puede ver los datos de otra.
      </Section>

      <Section title="Tus derechos">
        Puedes pedir la corrección o eliminación de tus datos personales en cualquier momento:
        contacta directamente a la clínica donde te atiendes, o escríbenos a{' '}
        <span className="font-medium text-text-primary">soporte@simplecite.lat</span>. Eliminaremos
        tu información salvo la que la clínica deba conservar por obligaciones médicas o legales.
      </Section>

      <Section title="Cambios a esta política">
        Si esta política cambia de forma sustancial, actualizaremos la fecha en esta página. El uso
        continuado de la plataforma implica la aceptación de la versión vigente.
      </Section>

      <p className="mt-10 border-t border-border pt-6 text-sm text-text-muted">
        ¿Dudas? Escríbenos a soporte@simplecite.lat · También puedes leer nuestros{' '}
        <Link href="/terminos" className="font-medium text-text-secondary underline">
          Términos del servicio
        </Link>
        .
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
