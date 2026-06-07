import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Output standalone → imagen Docker mínima (server.js + node_modules trazados).
  output: 'standalone',
  // Monorepo: raíz para el tracing de dependencias del bundle standalone.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
