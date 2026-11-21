import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Port 5174 so it does not clash with the other projects (5173).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174, strictPort: true },
  // The code editor chunk (~700 KB) is lazy-loaded only on contest pages, so quiz players never download it.
  build: { chunkSizeWarningLimit: 800 },
});
