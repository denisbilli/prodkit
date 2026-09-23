import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Somebody else's cookie banner.
 *
 * `mealie-recipes/mealie` keeps recipe pages scraped from other people's sites under
 * `tests/data/html/` to test its parser. They carry those sites' OneTrust scripts, and
 * mealie was credited with a consent banner it does not have. The consent search read HTML
 * from every file in the repository; it now reads the pages the product serves.
 */
describe("someone else's cookie banner", () => {
  it('does not read test data as the product\'s own page', async () => {
    const analysis = await analyzeProject(fixture('someone-elses-cookie-banner'));

    expect(analysis.detectors['gdpr.consent.route']?.present).toBe(false);
  });
});
