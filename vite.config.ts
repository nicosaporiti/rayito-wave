import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export default defineConfig({
  plugins: [react()],
  // Keep the package-relative worker URL intact during development.
  optimizeDeps: { exclude: ['@lightninglabs/wavelength-web'] },
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
});
