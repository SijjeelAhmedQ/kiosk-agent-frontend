import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // 5173 belongs to the kiosk itself. The agent drives that in browser mode,
    // so the two must be able to run side by side.
    port: 5174,
    strictPort: true,
  },
});
