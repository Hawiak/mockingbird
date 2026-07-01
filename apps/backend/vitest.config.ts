import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@mockingbird/shared-types': resolve(
        __dirname,
        '../../libs/shared-types/dist/index.js',
      ),
    },
  },
  esbuild: {
    target: 'es2021',
  },
});
