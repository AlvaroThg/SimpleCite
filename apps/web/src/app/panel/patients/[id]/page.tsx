'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useAuth } from '@/lib/panel-auth';
import { getPatientHistory, createNote, PanelApiError, type PatientHistory } from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { StatusBadge, fmtDateTime, ErrorBox } from '@/components/panel/ui';
import { SkeletonDetail } from '@/components/panel/Skeleton';
import { Markdown } from '@/components/panel/Markdown';

export default function PatientHistoryPage() {
  return (
    <PanelShell>
      <PatientHistoryView />
    </PanelShell>
  );
}

function PatientHistoryView() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<PatientHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      setData(await getPatientHistory(session.token, session.slug, id));
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'Error al cargar el historial');
    } finally {
      setLoading(false);
    }
  }, [session, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <SkeletonDetail />;
  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return null;

  const canWrite = session?.user.role === 'ADMIN' || session?.user.role === 'DOCTOR';

  return (
    <div className="space-y-6">
      <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-800">
        ← Volver
      </button>

      {/* Cabecera del paciente */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h1 className="text-xl font-bold text-gray-900">{data.patient.name}</h1>
        <p className="text-sm text-gray-500">{data.patient.phone}</p>
        {data.patient.ci && <p className="text-sm text-gray-500">CI: {data.patient.ci}</p>}
      </div>

      {/* Editor de notas (solo ADMIN/DOCTOR) */}
      {canWrite && data.clinicalAccess && <NoteEditor patientId={id} onSaved={load} />}

      {/* Notas clínicas */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Notas clínicas</h2>
        {!data.clinicalAccess ? (
          <div className="flex items-center justify-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-6 text-center text-sm text-gray-500">
            <Lock className="size-4 flex-shrink-0" /> No tienes acceso al contenido clínico de este
            paciente.
          </div>
        ) : data.notes.length === 0 ? (
          <p className="text-gray-400 text-sm">Aún no hay notas clínicas.</p>
        ) : (
          <ul className="space-y-3">
            {data.notes.map((n) => (
              <li key={n.id} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2 text-xs text-gray-400">
                  <span className="font-medium text-gray-600">{n.doctor.name}</span>
                  <span>{fmtDateTime(n.createdAt)}</span>
                </div>
                <Markdown content={n.content} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Historial de citas */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Citas</h2>
        {data.appointments.items.length === 0 ? (
          <p className="text-gray-400 text-sm">Sin citas registradas.</p>
        ) : (
          <ul className="space-y-2">
            {data.appointments.items.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/panel/appointments/${a.id}`}
                  className="block bg-white rounded-xl border border-gray-100 p-3 hover:border-brand-300 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{a.service.name}</p>
                      <p className="text-xs text-gray-500">{fmtDateTime(a.startTime)}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Editor de notas con Markdown + preview en vivo. */
function NoteEditor({ patientId, onSaved }: { patientId: string; onSaved: () => void }) {
  const { session } = useAuth();
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!session || content.trim().length < 3) return;
    setSaving(true);
    setError('');
    try {
      await createNote(session.token, session.slug, patientId, content.trim());
      setContent('');
      setPreview(false);
      onSaved();
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo guardar la nota');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Nueva nota clínica</p>
        <button
          onClick={() => setPreview((p) => !p)}
          className="text-xs text-brand-600 hover:text-brand-800 font-medium"
        >
          {preview ? 'Editar' : 'Vista previa'}
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      {preview ? (
        <div className="min-h-[120px] border border-gray-200 rounded-xl p-3 bg-gray-50">
          {content.trim() ? (
            <Markdown content={content} />
          ) : (
            <p className="text-gray-400 text-sm">Nada que previsualizar.</p>
          )}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Escribe la nota… Soporta Markdown: **negrita**, *itálica*, # títulos, - listas"
          rows={5}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent resize-y"
        />
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Markdown soportado</span>
        <button
          onClick={save}
          disabled={saving || content.trim().length < 3}
          className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold transition hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Guardando…' : 'Guardar nota'}
        </button>
      </div>
    </div>
  );
}
