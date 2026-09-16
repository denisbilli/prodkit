import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('backend framework coverage', () => {
  it('recognises Hono', async () => {
    const analysis = await analyzeProject(fixture('hono-api'));

    expect(analysis.stack.backend).toContain('hono');
  });

  it('does not call a static Astro site a backend', async () => {
    // The distinction this product is built on: a project is judged against what its
    // kind of product needs. Counting a brochure site as a backend would start marking
    // it down for missing sessions, tenant isolation and an audit trail it has no
    // reason to want.
    const analysis = await analyzeProject(fixture('astro-static'));

    expect(analysis.stack.frontend).toContain('astro');
    expect(analysis.stack.backend).not.toContain('astro');
  });

  it('calls an Astro site with an adapter a backend', async () => {
    const analysis = await analyzeProject(fixture('astro-server'));

    expect(analysis.stack.backend).toContain('astro');
  });
});
