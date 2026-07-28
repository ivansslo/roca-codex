import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'react-is': path.resolve(__dirname, 'node_modules/react-is/index.js'),
    },
    dedupe: ['react', 'react-dom', 'react-is', 'recharts'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-is', 'recharts', 'react/jsx-runtime', 'rollup'],
    esbuildOptions: {
      mainFields: ['browser', 'module', 'main'],
    },
  },
  ssr: {
    noExternal: ['recharts', 'react-is'],
    external: [
      'rollup',
      '@rollup/rollup-linux-arm64-gnu',
      '@rollup/rollup-linux-x64-gnu',
      '@rollup/rollup-linux-arm-gnueabihf',
      '@rollup/rollup-darwin-arm64',
      '@rollup/rollup-darwin-x64',
      '@rollup/rollup-win32-x64-msvc',
      '@rollup/rollup-win32-arm64-msvc',
      'fsevents'
    ],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
        },
      },
      external: [
        '@rollup/rollup-linux-arm64-gnu',
        '@rollup/rollup-linux-x64-gnu',
        '@rollup/rollup-linux-arm-gnueabihf',
        '@rollup/rollup-darwin-arm64',
        '@rollup/rollup-darwin-x64',
        '@rollup/rollup-win32-x64-msvc',
        '@rollup/rollup-win32-arm64-msvc',
        'fsevents'
      ],
    },
  },
  server: {
    // Loopback by default; set VITE_HOST only for trusted networks (e.g. Tailscale IP).
    host: process.env.VITE_HOST || '127.0.0.1',
    port: 3000,
    allowedHosts: process.env.VITE_ALLOWED_HOSTS ? process.env.VITE_ALLOWED_HOSTS.split(',') : ['localhost', '127.0.0.1'],
    hmr: false,
  },
});
