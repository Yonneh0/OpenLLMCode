import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src',
  base: './', // Relative asset paths — critical for Electron file:// production builds. Without this, Vite uses absolute paths (/assets/...) which resolve from filesystem root on file:// URLs (not relative to HTML).
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      // Externalize Node.js builtins — Vite bundles these as undefined in the renderer context
      // because they don't exist in a browser. With nodeIntegration enabled, the renderer has 
      // native require() and process globals, so we just need to tell Vite not to bundle them.
      external: ['path', 'fs', 'child_process', 'net', 'os', 'crypto'],
    },
  },
  plugins: [react(), tailwindcss()],
});
