// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import nextPlugin from '@next/eslint-plugin-next';

// Globals de Node 18+ (sin depender del paquete `globals`).
/** @type {Record<string, 'readonly' | 'writable' | 'off'>} */
const NODE_GLOBALS = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  module: 'readonly',
  require: 'readonly',
  exports: 'writable',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      'packages/database/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    // El seed y archivos CLI sí pueden usar console.log libremente
    files: ['**/prisma/seed.ts', '**/scripts/**'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // NestJS resuelve DI vía emitDecoratorMetadata, que necesita los tipos
    // como valores en runtime. `import type { PrismaService }` se borra en
    // el JS compilado y rompe `constructor(prisma: PrismaService)`. La regla
    // se desactiva acá para que el autofix no vuelva a introducir el bug.
    files: ['apps/api/src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // Next.js usa valor de `NextRequest`/`NextResponse` en middleware y edge
    // runtime aunque el autofix los clasifique como type-only. Deshabilitar
    // en web para evitar falsos positivos del mismo autofix de ESLint.
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // Plugin oficial de Next.js: registra las reglas `@next/next/*`. Sin esto,
    // los `eslint-disable-next-line @next/next/no-img-element` del código web
    // apuntan a una regla inexistente y `next build` (fase ESLint) falla con
    // "Definition for rule '@next/next/no-img-element' was not found".
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    // Cast: el plugin tipa los valores como `string`; en flat config son
    // RuleEntry válidos en runtime ("warn"/"error"). `@ts-check` necesita el cast.
    rules: /** @type {Record<string, any>} */ ({
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    }),
  },
  {
    // Archivos de configuración CommonJS (jest.config.js, etc.): tienen
    // `module`, `require`, `process`… del entorno Node.
    files: ['**/*.config.js', '**/*.config.cjs', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: NODE_GLOBALS,
    },
  },
  {
    // Instancia WhatsApp: JS/ESM plano de Node (Baileys wrapper). Usa globals
    // de Node (process, fetch, timers, console) y un catch vacío intencional.
    files: ['apps/whatsapp-instance/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: NODE_GLOBALS,
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    // Tests: los mocks de Prisma usan `any` legítimamente para castear
    // objetos parciales; no aporta tiparlos al 100%.
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
