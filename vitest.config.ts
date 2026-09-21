import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    /**
     * Five seconds is not enough for a test that walks the whole fixture corpus, and
     * neither is thirty any more.
     *
     * Several checks in this suite are properties rather than cases — "no finding a
     * reader is shown says nothing", "no report contradicts itself" — and each one
     * analyses every fixture in `tests/fixtures`. That was over a hundred
     * repositories when this was raised to thirty seconds; it is 216 now, seven of
     * those properties exist, and they run beside everything else. All seven timed
     * out together — not on an assertion, on the clock.
     *
     * One of them takes twelve seconds with the machine to itself, so the number is
     * four times that rather than a guess. Raised rather than narrowed, for the
     * reason recorded the first time: a property checked against one fixture is not
     * the property. The cost is that a genuinely hung test takes a minute to say so.
     *
     * The waste underneath is real and is not fixed here: the corpus is analysed
     * seven times over, once per property, because vitest gives each file its own
     * worker and nothing is shared between them.
     */
    testTimeout: 60_000,
  },
});
