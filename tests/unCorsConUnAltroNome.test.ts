import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const cors = async (name: string) => {
  const analysis = await analyzeProject(fixture(name));
  const report = buildReport(analysis, { profile: 'b2b-saas' });
  return {
    details: analysis.detectors['security.core']?.details ?? {},
    finding: report.findings.find((item) => item.id === 'security.cors-origin'),
  };
};

/**
 * A wide-open cross-origin policy, reported as no policy at all.
 *
 *     const apriTutto = require('cors');
 *     app.use(apriTutto());
 *
 * `cors(` is the name of the export and an author is free not to use it. This one did
 * not, and `security.cors-origin` came back `unknown` — "CORS configuration not
 * detected" — about a server open to the whole web. A real hole reported as the
 * absence of a question, which is the worst of the two directions.
 *
 * The import is the fact. The name is whatever this author typed, and it is read from
 * the binding rather than guessed from a list.
 */
describe('a cross-origin policy is one under any name', () => {
  it('sees a wide-open policy applied under a name nobody would guess', async () => {
    const { details, finding } = await cors('cors-under-another-name');

    expect(details.corsLoose).toBe(true);
    expect(finding?.status).toBe('partial');
  });

  it('still says nothing where the package is imported and never applied', async () => {
    // The binding must not turn an unused import into a policy.
    const { details } = await cors('cors-mentioned-not-used');

    expect(details.corsLoose).toBe(false);
    expect(details.corsStrict).toBe(false);
  });

  it('keeps telling an allowlist apart from a wildcard', async () => {
    const { details } = await cors('cors-per-line');

    expect(details.corsLoose).toBe(true);
    expect(details.corsStrict).toBe(true);
  });
})
