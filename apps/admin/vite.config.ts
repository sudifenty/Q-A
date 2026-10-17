import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    /* the sandbox preview is served from a generated *.e2b.app host; without
       this Vite answers "Blocked request. This host is not allowed." */
    allowedHosts: ['.e2b.app', 'localhost']
  }
});
