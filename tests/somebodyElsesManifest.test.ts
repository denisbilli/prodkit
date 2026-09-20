import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Three manifests in one repository, and only one of them is the product's.
 *
 * meilisearch was reported as using Rocket. Rocket appears once in that repository: as
 * a dev-dependency of `external-crates/reqwest-eventsource`, a third-party crate
 * copied in whole. Two mistakes stacked — a vendored library's manifest read as the
 * project's, and a dev-dependency read as something the product ships.
 */
describe('a vendored crate and a sample speak for themselves', () => {
  it('names only the framework the product itself ships', async () => {
    const analysis = await analyzeProject(fixture('rust-with-vendored-crate'));

    expect(analysis.stack.backend).toEqual(['actix-web']);
  });

  it('does not take a framework from a dev-dependency', async () => {
    // The product's own Cargo.toml has axum under [dev-dependencies]: a test server.
    const analysis = await analyzeProject(fixture('rust-with-vendored-crate'));

    expect(analysis.stack.backend).not.toContain('axum');
  });

  it('does not read sample code as the product', async () => {
    const analysis = await analyzeProject(fixture('rust-with-vendored-crate'));

    expect(analysis.stack.backend).not.toContain('warp');
    expect(analysis.files.source.every((file) => !file.includes('samples/'))).toBe(true);
    expect(analysis.files.source.every((file) => !file.includes('external-crates/'))).toBe(true);
  });
});

/**
 * No profile applied is not a profile satisfied.
 *
 * An inconclusive inference produces a profile record with an empty gap — nothing
 * required, so nothing missing — and the verdict read "This project covers everything
 * expected of Auto (inconclusive). What remains is refinement, not blockers."
 * meilisearch, a search engine somebody self-hosts, was told it was ready to launch
 * because no expectations had been applied to it.
 */
describe('a project with no profile is not ready to launch as nothing', () => {
  it('does not claim a project covers what nobody asked of it', async () => {
    const report = buildReport(await analyzeProject(fixture('rust-with-vendored-crate')), {
      profile: 'auto',
    });

    if (report.productProfile?.selectedProfile === 'auto') {
      expect(report.executiveSummary.launchReady).toBeNull();
      expect(report.executiveSummary.verdict).not.toMatch(/covers everything expected/i);
      expect(report.executiveSummary.verdict).not.toMatch(/Auto \(inconclusive\)/);
    }
  });

  it('still answers launch readiness where a profile was applied', async () => {
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'b2b-saas' });

    expect(typeof report.executiveSummary.launchReady).toBe('boolean');
  });
})
