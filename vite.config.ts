import { defineConfig } from 'vite';

export default defineConfig({
  root: 'site',
  base: '/my-scarves/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
