import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // Four entries, four apps. The errand console on /, the A2A console on
    // /a2a.html, the delivery agent's board on /foodpanda.html, and the
    // operations dashboard on /dashboard.html — separate pages rather than
    // routes, because they talk to different services and none should be able to
    // break the others. The dashboard is the only one that reads all four, which
    // makes keeping it a separate entry more important rather than less. The dev
    // server finds them on its own; only the build needs telling.
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        a2a: path.resolve(__dirname, 'a2a.html'),
        foodpanda: path.resolve(__dirname, 'foodpanda.html'),
        dashboard: path.resolve(__dirname, 'dashboard.html'),
      },
    },
  },
  server: {
    // 5173 belongs to Friends Kitchen itself. The agent drives that in browser mode,
    // so the two must be able to run side by side.
    port: 5174,
    strictPort: true,
  },
});
