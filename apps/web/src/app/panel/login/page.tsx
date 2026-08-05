'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/panel-auth';
import { PanelApiError } from '@/lib/panel-api';
import { clearPanelSession } from '@/lib/panel-session-key';
import { Eye, EyeOff } from 'lucide-react';

export default function PanelLoginPage() {
  const { session, login } = useAuth();
  const router = useRouter();

  const [slug, setSlug] = useState('clinica-demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // `?expired=1` lo pone panel-api al recibir un 401: la sesión venció y hay que
  // avisarlo en vez de mostrar "Unauthorized". `?next=` es la ruta de vuelta.
  const [expired, setExpired] = useState(false);
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isExpired = params.get('expired') === '1';
    setExpired(isExpired);
    // La sesión venció: si quedara algo en localStorage, el efecto de abajo
    // rebotaría al panel y el usuario nunca podría volver a entrar.
    if (isExpired) clearPanelSession();
    const back = params.get('next');
    if (back?.startsWith('/')) setNext(back);
  }, []);

  // Si ya hay sesión, ir directo a citas. Nunca cuando venimos de una sesión
  // vencida: ahí la sesión local es basura y hay que dejar iniciar de nuevo.
  useEffect(() => {
    if (session && !expired) router.replace('/panel/appointments');
  }, [session, expired, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setExpired(false);
    try {
      await login(slug.trim(), email.trim(), password);
      router.replace(next ?? '/panel/appointments');
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
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/logo.png"
            alt="SimpleCite"
            width={2031}
            height={774}
            priority
            className="h-16 w-auto"
          />
          <p className="text-sm text-text-muted mt-1">Panel profesional</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface rounded-2xl shadow-sm border border-border p-6 space-y-4"
        >
          {expired && !error && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-sm">
              Tu sesión venció por seguridad. Vuelve a iniciar sesión para continuar.
            </div>
          )}

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
            className="w-full py-2.5 rounded-xl bg-brand-600 text-white font-semibold text-sm transition hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
  // Ver la contraseña que se está escribiendo: en el celular la recepción se
  // equivoca al teclear y quedaba adivinando por qué "no entra".
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-text-secondary">{label}</label>
      <div className="relative">
        <input
          type={isPassword && reveal ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent ${
            isPassword ? 'pr-11' : ''
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={reveal}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-text-muted transition hover:text-text-primary"
          >
            {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
