import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist/client' },
  resolve: { alias: [
    { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
    { find: /^lucide-react$/, replacement: path.resolve(import.meta.dirname, 'src/lib/lucide-react.tsx') },
    { find: 'lucide-react-upstream', replacement: path.resolve(import.meta.dirname, 'node_modules/lucide-react') },
    { find: /^recharts$/, replacement: path.resolve(import.meta.dirname, 'src/lib/recharts.tsx') },
    { find: 'recharts-upstream', replacement: path.resolve(import.meta.dirname, 'node_modules/recharts') },
  ] },
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
