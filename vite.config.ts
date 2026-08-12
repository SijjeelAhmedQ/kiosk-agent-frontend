import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // Two entries, two apps. The errand console on /, the A2A console on
    // /a2a.html — separate pages rather than routes, because they talk to
    // different services and neither should be able to break the other.
    // The dev server finds both on its own; only the build needs telling.
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        a2a: path.resolve(__dirname, 'a2a.html'),
      },
    },
  },
  server: {
    // 5173 belongs to the kiosk itself. The agent drives that in browser mode,
    // so the two must be able to run side by side.
    port: 5174,
    strictPort: true,
  },
});
