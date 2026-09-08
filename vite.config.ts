import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';

export default defineConfig({
  plugins: [solid()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
