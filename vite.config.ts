import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' にして、GitHub Pages などどのフォルダに置いても動くようにする
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  server: { host: true },
});
