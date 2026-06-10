/**
 * Base URL del API resuelta según el contexto de ejecución.
 *
 * El navegador y el contenedor de la web NO comparten `localhost`: el SSR corre
 * dentro del contenedor (su `localhost` es él mismo), mientras que el navegador
 * vive en el host. Por eso un solo valor no alcanza:
 *
 *   - Servidor (SSR / RSC): usa `INTERNAL_API_URL` (red interna de contenedores;
 *     se lee en runtime, no se inlinea), cae a `NEXT_PUBLIC_API_URL`.
 *   - Navegador: usa `NEXT_PUBLIC_API_URL` (inlineada en build).
 *
 * Local Docker:  build NEXT_PUBLIC_API_URL=http://localhost:3001 (navegador)
 *                runtime INTERNAL_API_URL=http://simplecite-api:3001 (SSR)
 * Dokploy/prod:  NEXT_PUBLIC_API_URL=https://api.simplecite.com.bo (navegador)
 *                INTERNAL_API_URL=http://api:3001 (SSR por red interna)
 */
export function apiBase(): string {
  if (typeof window === 'undefined') {
    return (
      process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
    );
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}
