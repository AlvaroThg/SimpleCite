/**
 * Configuración de Jest para la API (NestJS + ts-jest).
 *
 * - Tests unitarios: *.spec.ts junto al código en src/.
 * - Resuelve los alias `@/` y deja que `@simplecite/*` resuelva por el
 *   symlink de pnpm (los packages están construidos en dist/).
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  // Evita que ts-jest falle por tipos de node_modules no relevantes al test.
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!main.ts', '!**/*.module.ts'],
};
