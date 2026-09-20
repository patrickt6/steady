import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'tools/rig/build',
    emptyOutDir: true,
    lib: {
      entry: 'tools/rig/entry.ts',
      name: 'SteadyRig',
      formats: ['iife'],
      fileName: () => 'rig.js',
    },
  },
});
