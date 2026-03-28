import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: './src/renderer',
  base: './',
  publicDir: '../../public',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@main': path.resolve(__dirname, './src/main'),
      '@services': path.resolve(__dirname, './src/services'),
      '@workers': path.resolve(__dirname, './src/workers'),
      '@components': path.resolve(__dirname, './src/renderer/components'),
    },
  },
  server: {
    port: 5173,
  },
});
