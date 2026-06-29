# design-sync — notas de SimpleCite

Repo-specific para el sync del design system a claude.ai/design.

## Contexto del repo (importante)

- **`apps/web` es una app Next.js, NO una librería.** No tiene `main`/`module`/`exports`,
  así que el converter corre en **synth-entry**: se le pasa `--entry ./apps/web/.ds-entry.tsx`
  (un barrel que re-exporta SOLO los componentes del DS) para que el bundler no toque el
  resto de la app (páginas, panel, calendarios — acoplados a `next/navigation`/`next/link`).
- `apps/web/.ds-entry.tsx` y `apps/web/.ds-compiled.css` son **artefactos de sync** (gitignored).
  Si se agregan componentes al scope, hay que añadirlos al barrel Y a `componentSrcMap`.
- `--node-modules apps/web/node_modules` (ahí resuelven react, radix, cva, lucide, sonner).

## CSS / Tailwind v4

- El estilo viene de Tailwind v4 (`@import "tailwindcss"` + `@theme`) en
  `apps/web/src/app/globals.css`. No hay stylesheet precompilado, así que se **genera**:
  `.ds-sync/tw-input.css` (réplica de globals + `@source` a los componentes/previews +
  Inter por CDN) se compila con `@tailwindcss/cli` a `apps/web/.ds-compiled.css`, y
  `cfg.cssEntry` apunta ahí.
- **Regenerar el CSS** si cambian las clases de los componentes o de los previews:
  `cd .ds-sync && node node_modules/@tailwindcss/cli/dist/index.mjs -i tw-input.css -o ../apps/web/.ds-compiled.css`
  y luego volver a anteponer el `@import` de Inter (la primera línea).
- **Inter**: en la app la inyecta `next/font`; aquí se clasifica como
  `runtimeFontPrefixes: ["Inter"]` (la sirve el host en runtime) y además se carga por CDN
  en el CSS compilado para que los previews se vean en Inter. Por eso validate marca
  `[FONT_REMOTE]` (informativo).

## Previews

- Importan del paquete `'web'` (mapeado a `window.SimpleCite` por el shim del converter).
- **Toaster (sonner) queda en floor card a propósito**: sonner solo pinta toasts al llamar
  `toast()` (interacción), no hay estado estático que renderizar. Es un diferido, no un fallo.
- **PaymentQRSelector**: `cfg.overrides.PaymentQRSelector.cardMode = "column"` (el QR es más
  ancho que una celda de grid). El `qrUrl` del preview es un SVG data-URI generado (patrón
  estable por banco, NO escaneable); en producción es la imagen real subida por la clínica.

## Playwright

- Cache de chromium **build 1223** → instalado `playwright@1.60.0` (lo pinea). `playwright@latest`
  (1.61.x) pinea 1228 y fallaría. Si cambia el cache, buscar la versión que pinee ese build.

## Known render warns (validate)

- `[FONT_REMOTE]` Inter — esperado (CDN), no es un warn nuevo.
- `[GRID_OVERFLOW]` PaymentQRSelector — resuelto con `cardMode: column`.

## Re-sync risks (qué vigilar la próxima vez)

- El CSS compilado (`apps/web/.ds-compiled.css`) es un artefacto: si cambian tokens en
  `globals.css` o clases de componentes, hay que **regenerarlo** antes de reconstruir, o los
  previews quedan con CSS viejo.
- El barrel `.ds-entry.tsx` y `componentSrcMap` deben moverse juntos si cambia el scope.
- Inter por CDN: si se quiere fidelidad offline, shippear los `.woff2` vía `cfg.extraFonts`.
- Toaster sigue en floor card hasta que alguien quiera autorar una composición con `toast()`
  disparado (requeriría un override de interacción).
