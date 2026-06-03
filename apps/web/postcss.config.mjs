/**
 * PostCSS config para Tailwind CSS v4.
 *
 * Tailwind v4 se integra como plugin de PostCSS vía `@tailwindcss/postcss`.
 * Sin esto, el `@import "tailwindcss"` de globals.css no se procesa y no se
 * genera ninguna utilidad (la app sale sin estilos).
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
