import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    /**
     * Five seconds is not enough for a test that walks the whole fixture corpus.
     *
     * Several checks in this suite are properties rather than cases — "no finding a
     * reader is shown says nothing", "no report contradicts itself" — and each one
     * analyses every fixture in `tests/fixtures`. That is over a hundred repositories
     * and climbing, and three of them timed out at the default the first time the
     * machine was also doing something else.
     *
     * Raised rather than narrowed: a property checked against one fixture is not the
     * property. The cost is that a genuinely hung test takes half a minute to say so.
     */
    testTimeout: 30_000,
  },
});
