import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTenantInfo, getDoctors } from '@/lib/api';

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 3600; // ISR: regenerar cada hora

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

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-12">
      {/* Hero */}
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">{tenant.name}</h1>
        <p className="text-lg text-gray-600 max-w-xl mx-auto">
          Reserva tu cita de forma rápida y sencilla. Sin llamadas, sin esperas.
        </p>
        <Link
          href={`/${slug}/booking`}
          className="inline-block mt-2 px-8 py-3 rounded-xl text-white font-semibold text-lg shadow-md transition hover:opacity-90 active:scale-95"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          Reservar cita
        </Link>
      </section>

      {/* Doctores */}
      {doctors.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">Nuestros especialistas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {doctors.map((doctor) => (
              <div
                key={doctor.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3"
              >
                {/* Avatar placeholder */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                    style={{ backgroundColor: tenant.primaryColor }}
                  >
                    {doctor.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{doctor.name}</p>
                    {doctor.doctorProfile?.specialty && (
                      <p className="text-sm text-gray-500">{doctor.doctorProfile.specialty}</p>
                    )}
                  </div>
                </div>

                {doctor.doctorProfile?.bio && (
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {doctor.doctorProfile.bio}
                  </p>
                )}

                {/* Servicios */}
                {doctor.doctorServices.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Servicios
                    </p>
                    <ul className="space-y-1">
                      {doctor.doctorServices.map((ds) => (
                        <li key={ds.id} className="flex justify-between text-sm text-gray-700">
                          <span>{ds.service.name}</span>
                          <span className="text-gray-500">
                            Bs {Number(ds.customPrice ?? ds.service.price).toFixed(0)} ·{' '}
                            {ds.customDuration ?? ds.service.duration} min
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA inferior */}
      <section className="text-center py-6">
        <Link
          href={`/${slug}/booking`}
          className="inline-block px-10 py-4 rounded-2xl text-white font-bold text-xl shadow-lg transition hover:opacity-90 active:scale-95"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          Agendar mi cita
        </Link>
      </section>
    </div>
  );
}
