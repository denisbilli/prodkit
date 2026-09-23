import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A framework's benchmarks are not its product.
 *
 * `honojs/hono` has an Express and a Hono app in every `benchmarks/*` workspace,
 * `new Hono()` in `perf-measures/` and `runtime-tests/`, and JSX pages in `benchmarks/jsx/`,
 * and a web framework came out as a consumer application at high confidence. Benchmarks
 * and runtime test suites build servers and pages to measure the product, not to be it.
 */
describe('a JS framework and its benchmarks', () => {
  it('reads servers and pages in benchmarks and runtime tests as not the product', async () => {
    const analysis = await analyzeProject(fixture('a-js-framework-and-its-benchmarks'));

    expect(inferProductProfile(analysis).inferredProfile).toBe('library');
  });

  /** An application with a server in `src/` is still one, benchmarks beside it or not. */
  it('still reads an app that benchmarks itself as an app', async () => {
    const analysis = await analyzeProject(fixture('an-app-that-benchmarks-itself'));

    expect(inferProductProfile(analysis).inferredProfile).not.toBe('library');
  });
});
