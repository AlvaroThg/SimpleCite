'use client';

import * as React from 'react';
import { AlertTriangle, RotateCcw, LogOut } from 'lucide-react';
import { clearPanelSession } from '@/lib/panel-session-key';

/**
 * Error Boundary del panel (los boundaries de React siguen exigiendo class
 * component). Sin esto, una excepción de render en cualquier página mostraba
 * la pantalla de error genérica de Next en lugar de algo accionable.
 *
 * Ofrece reintentar (re-monta el subtree) y cerrar sesión (por si el estado
 * corrupto viene de una sesión rota en localStorage).
 */
interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
}

export class PanelErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // El panel no tiene telemetría; al menos dejar rastro en la consola
    // del navegador para diagnóstico con el cliente en la línea.
    console.error('[PanelErrorBoundary]', error, info.componentStack);
  }

  private retry = () => this.setState({ hasError: false });

  private logoutAndReload = () => {
    clearPanelSession();
    window.location.href = '/panel/login';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertTriangle className="size-7" />
          </div>
          <h2 className="text-xl font-bold text-text-primary">Algo salió mal</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Ocurrió un error inesperado en el panel. Tus datos están a salvo; reintenta o vuelve a
            iniciar sesión.
          </p>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <button
              onClick={this.retry}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-95"
            >
              <RotateCcw className="size-4" /> Reintentar
            </button>
            <button
              onClick={this.logoutAndReload}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-text-secondary transition hover:bg-canvas active:scale-95"
            >
              <LogOut className="size-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }
}
