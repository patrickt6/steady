import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built site works from a project subpath on GitHub Pages
  // as well as from the domain root or a local file server.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
