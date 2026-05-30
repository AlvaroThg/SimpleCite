// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

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
);
