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
 * Rails configures this in a gem with a small language of its own.
 *
 * chatwoot scored 98 and `production_ready` with its cross-origin policy reported as
 * "not detected". It installs `rack-cors`, mounts `Rack::Cors` as the first
 * middleware in `config/initializers/cors.rb`, and writes `origins '*'` — which opens
 * `/packs/*`, `/audio/*`, `/public/api/*`, and everything else when
 * `CW_API_ONLY_SERVER` is set. Not one of the words this check looked for appears in
 * that file: the gem's DSL says `origins`, not `Access-Control-Allow-Origin`.
 *
 * It is the second time in two releases. kimai hid the same thing behind Symfony's
 * `nelmio_cors.yaml`, and the shape is identical — a framework configures CORS in a
 * file, in a vocabulary its own package defines, and a search built from HTTP header
 * names cannot see any of it. Both products read as having thought about nothing,
 * which is the worst direction for this check.
 *
 * chatwoot goes from 98 to 88, cited at `config/initializers/cors.rb:8`.
 */
describe('Rails configures CORS in a gem', () => {
  it('reads origins * as the wide-open policy it is', async () => {
    const found = await cors('rails-rack-cors-open');

    expect(found?.status).toBe('partial');
    expect(found?.evidence.some((e) => String(e.value) === "origins '*'")).toBe(true);
  });

  it('reads a chosen origin as a decision somebody made', async () => {
    expect((await cors('rails-rack-cors-chosen'))?.status).toBe('passed');
  });
});
