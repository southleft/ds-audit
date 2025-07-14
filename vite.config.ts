import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/dashboard'),
  build: {
    outDir: path.resolve(__dirname, 'dist/dashboard'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/dashboard/index.html')
      }
    }
  },
  server: {
    port: 3001,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/dashboard'),
      '@components': path.resolve(__dirname, 'src/dashboard/components'),
      '@hooks': path.resolve(__dirname, 'src/dashboard/hooks'),
      '@utils': path.resolve(__dirname, 'src/dashboard/utils'),
      '@types': path.resolve(__dirname, 'src/types')
    }
  }
});