import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A library's documentation is not its product.
 *
 * `colinhacks/zod` keeps its current docs on Fumadocs in `packages/docs/` and the previous
 * version's site in `packages/docs-v3/`. Fumadocs was not a known docs generator, and
 * `docs-v3/` was not a docs directory, so two `index.html` files made zod's front end its
 * product and a TypeScript library was inferred as a client application at high
 * confidence.
 */
describe('a library with a docs site', () => {
  it('reads a versioned docs directory as documentation', async () => {
    const analysis = await analyzeProject(fixture('a-library-with-old-docs'));

    expect(analysis.detectors['docs.site']?.present).toBe(true);
    expect(inferProductProfile(analysis).inferredProfile).toBe('library');
  });

  it('reads Fumadocs as a docs generator', async () => {
    const analysis = await analyzeProject(fixture('a-library-with-fumadocs'));

    expect(analysis.detectors['docs.site']?.present).toBe(true);
    expect(inferProductProfile(analysis).inferredProfile).toBe('library');
  });
});
