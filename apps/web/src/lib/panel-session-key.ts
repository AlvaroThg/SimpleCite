/**
 * Clave de la sesión del panel en localStorage.
 *
 * Vive aparte porque la usan tres módulos que no pueden importarse entre sí sin
 * ciclos: panel-auth (dueño de la sesión), panel-api (la limpia al recibir un
 * 401) y el ErrorBoundary. El objeto guardado NO contiene el JWT — ese vive en
 * una cookie httpOnly; aquí solo queda el "hay sesión" y los datos del usuario.
 */
export const PANEL_SESSION_KEY = 'simplecite_panel_session';

/** Borra la sesión local. Sin efecto fuera del navegador (SSR). */
export function clearPanelSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PANEL_SESSION_KEY);
  } catch {
    // localStorage puede fallar (modo privado, cuota): no es crítico.
  }
}
