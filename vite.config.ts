import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => ({
  plugins: [solid()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build:
    mode === 'design-system'
      ? {
          outDir: 'dist-design-system',
          rolldownOptions: { input: resolve(import.meta.dirname, 'design-system.html') },
        }
      : undefined,
}));
