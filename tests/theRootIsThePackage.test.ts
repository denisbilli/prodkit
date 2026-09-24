import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A workspace whose root is the package.
 *
 * hono added a `pnpm-workspace.yaml` listing only `'.'`. The search for a published
 * member then found `benchmarks/jsx/package.json` — named `jsx`, versioned `1.0.0` —
 * and a typed, exported web framework was described by a benchmark's `"main"`. npm
 * publishes the manifest it is run beside; a root that is named, versioned and not
 * private is the package.
 */
describe('the root is the package', () => {
  it('reads the root manifest when the root is publishable', async () => {
    const entrypoints = (await analyzeProject(fixture('root-is-the-package'))).detectors['packaging.entrypoints'];

    expect(entrypoints?.evidence.some((e) => e.value === 'TypeScript types are declared')).toBe(true);
    expect(entrypoints?.evidence.some((e) => e.value === 'package.json declares "exports"')).toBe(true);
  });
});
