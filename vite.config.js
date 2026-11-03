import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/History/' : '/',
  build: { outDir: 'dist', emptyOutDir: true }
});