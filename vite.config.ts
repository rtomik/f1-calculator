/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base so the build works from any static host sub-path.
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    coverage: {
      include: ['src/engine/**'],
      exclude: ['src/engine/**/*.test.ts', 'src/engine/types.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
