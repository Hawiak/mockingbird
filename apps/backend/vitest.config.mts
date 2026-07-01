import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@mockingbird/shared-types': resolve(__dirname, '../../libs/shared-types/src/index.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['verbose'],
  },
});
