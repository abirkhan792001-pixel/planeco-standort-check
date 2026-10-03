import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  // Next's tsconfig says `jsx: preserve`; tests that render a component to static markup need the automatic runtime.
  oxc: { jsx: { runtime: 'automatic' } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
