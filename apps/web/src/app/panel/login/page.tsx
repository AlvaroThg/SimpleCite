'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/panel-auth';
import { PanelApiError } from '@/lib/panel-api';

export default function PanelLoginPage() {
  const { session, login } = useAuth();
  const router = useRouter();

  const [slug, setSlug] = useState('clinica-demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Si ya hay sesión, ir directo a citas.
  useEffect(() => {
    if (session) router.replace('/panel/appointments');
  }, [session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(slug.trim(), email.trim(), password);
      router.replace('/panel/appointments');
    } catch (err) {
      setError(
        err instanceof PanelApiError
          ? err.status === 401
            ? 'Credenciales incorrectas'
            : err.message
          : 'No se pudo iniciar sesión',
      );
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/icon.png"
            alt="SimpleCite"
            width={1254}
            height={1254}
            priority
            className="w-14 h-14 rounded-2xl shadow-sm"
          />
          <Image
            src="/logo.png"
            alt="SimpleCite"
            width={2031}
            height={774}
            className="h-6 w-auto mt-3"
          />
          <p className="text-sm text-gray-500 mt-1">Panel profesional</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4"
        >
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <Field
            label="Clínica (slug)"
            value={slug}
            onChange={setSlug}
            placeholder="clinica-demo"
          />
          <Field
            label="Correo"
            value={email}
            onChange={setEmail}
            placeholder="doctor@clinica.com"
            type="email"
          />
          <Field
            label="Contraseña"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            type="password"
          />

          <button
            type="submit"
            disabled={loading || !slug || !email || !password}
            className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
      />
    </div>
  );
}
