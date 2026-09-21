import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const cors = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === 'security.cors-origin');
};

/**
 * Symfony configures this in a bundle, and the bundle names the file.
 *
 * kimai scored 93 and `production_ready` while its API answered every origin on earth.
 * `config/packages/nelmio_cors.yaml` sets `allow_origin: []` in its defaults — the
 * bundle's own comment there says "for security reasons we do not allow CORS by
 * default" — and then `allow_origin: ['*']` under `^/api/`. The report said "CORS
 * configuration not detected" and gave no verdict at all: a product that opened its
 * API to the whole web was told it was ready to ship.
 *
 * `nelmio/cors-bundle` is what a Symfony project installs for this, `nelmio_cors` is
 * the configuration key the bundle defines, and `allow_origin` is its setting. None of
 * the three is the author's to choose; the values are.
 *
 * kimai goes from 93 and `production_ready` to 83 and `partial`.
 */
describe('Symfony configures CORS in a bundle', () => {
  it('reads the override that opens the API, not the default that closes it', async () => {
    const found = await cors('symfony-cors-wide-open');

    expect(found?.status).toBe('partial');
    expect(found?.evidence.some((e) => String(e.value).includes("allow_origin: ['*']"))).toBe(true);
  });

  /**
   * Every `allow_origin` in the file is read, not the first. A bundle configures
   * defaults and then overrides them per path, and it is the override that is
   * reachable — which is also why the empty default list is skipped rather than
   * counted as a decision to restrict.
   */
  it('reads a chosen origin as a decision somebody made', async () => {
    const found = await cors('symfony-cors-chosen');

    expect(found?.status).toBe('passed');
    expect(found?.evidence.some((e) => String(e.value).includes("allow_origin: ['https://app.acme.com']"))).toBe(true);
    /** The empty default is the bundle refusing, not an allowlist somebody wrote. */
    expect(found?.evidence.some((e) => String(e.value).includes('allow_origin: []'))).toBe(false);
  });
});
