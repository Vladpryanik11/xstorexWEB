import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.int.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
  },
});
