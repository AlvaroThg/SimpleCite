'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Users, Search } from 'lucide-react';
import { useAuth } from '@/lib/panel-auth';
import { getPatients, PanelApiError, type PatientListItem } from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { ErrorBox } from '@/components/panel/ui';
import { SkeletonList } from '@/components/panel/Skeleton';
import { EmptyState } from '@/components/ui/empty-state';

/** Iniciales (máx. 2) para el avatar a partir del nombre del paciente. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

export default function PatientsPage() {
  return (
    <PanelShell>
      <PatientsList />
    </PanelShell>
  );
}

function PatientsList() {
  const { session } = useAuth();
  const [items, setItems] = useState<PatientListItem[]>([]);
  const [q, setQ] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (search: string, cursor?: string) => {
      if (!session) return;
      setLoading(true);
      setError('');
      try {
        const page = await getPatients(session.token, session.slug, {
          q: search || undefined,
          cursor,
          limit: 20,
        });
        setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch (err) {
        setError(err instanceof PanelApiError ? err.message : 'Error al cargar pacientes');
      } finally {
        setLoading(false);
      }
    },
    [session],
  );

  // Carga inicial + búsqueda con debounce.
  useEffect(() => {
    const t = setTimeout(() => void load(q), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Pacientes</h1>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, teléfono o CI…"
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
      />

      {error && <ErrorBox message={error} />}
      {loading && items.length === 0 ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        q ? (
          <EmptyState
            icon={<Search />}
            title="Sin resultados"
            description="No encontramos pacientes que coincidan con tu búsqueda."
          />
        ) : (
          <EmptyState
            icon={<Users />}
            title="Aún no hay pacientes"
            description="Los pacientes aparecerán aquí cuando reserven o cuando registres una cita manual."
          />
        )
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/panel/patients/${p.id}`}
                  className="block bg-white rounded-xl border border-gray-100 p-4 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 font-semibold">
                        {initials(p.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                        <p className="text-sm text-gray-500 truncate">
                          {p.phone}
                          {p.ci ? ` · CI ${p.ci}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {p._count.appointments} cita{p._count.appointments === 1 ? '' : 's'}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {nextCursor && (
            <button
              onClick={() => void load(q, nextCursor)}
              disabled={loading}
              className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 transition-all hover:bg-gray-100 hover:border-gray-300 disabled:opacity-50"
            >
              {loading ? 'Cargando…' : 'Cargar más'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
