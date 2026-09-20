import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixturesDir = path.resolve(__dirname, 'fixtures');
const fixtures = fs
  .readdirSync(fixturesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe('severity and status agree', () => {
  /**
   * An invariant rather than a list of cases, because the failure it guards against is
   * a rule re-deciding severity on its own. Six rules did exactly that — each an inline
   * copy of sevForStatus — and the one that mattered most, the Django DEBUG check, kept
   * `critical` on projects with no Python in them. Its evidence read "Django stack not
   * detected".
   *
   * Nothing shipped was misled, because every first-party consumer also filters on
   * status. But that pair has to be written out at each call site, and a third party
   * reading the JSON through the MCP server or the Action has no way to know it must.
   */
  /**
   * Both readings, because the report has two halves and this walked one of them.
   *
   * `buildReport(analysis)` with no options is the observed-only reading: no profile is
   * inferred, so none of the `expectation.*` findings exist. Measured on the fixture
   * corpus, 45 of 145 repositories carry a high-severity GDPR demand under `auto` and
   * none of them under the default — so every expectation this invariant is supposed to
   * cover was outside it.
   */
  it.each(fixtures)('%s reports no severe finding that does not apply', async (fixture) => {
    const analysis = await analyzeProject(path.join(fixturesDir, fixture));

    for (const report of [buildReport(analysis), buildReport(analysis, { profile: 'auto' })]) {
      const contradictions = report.findings
        .filter((finding) => finding.status === 'unknown' && finding.severity !== 'info')
        .map((finding) => `${finding.id} is ${finding.severity} while unknown`);

      expect(contradictions, `${fixture} as ${report.diagnostics.selectedProfile}`).toEqual([]);
    }
  });

  /**
   * That the second reading is not the first one again.
   *
   * The invariant above says nothing when both reports are identical, and identical is
   * exactly what they were until this file passed a profile: `buildReport(analysis)`
   * infers nothing, so every `expectation.*` finding was outside the walk. This holds
   * the difference open so the coverage cannot quietly close again.
   */
  it('reads more under a profile than it does without one', async () => {
    const analysis = await analyzeProject(path.join(fixturesDir, 'express-basic'));
    const observed = buildReport(analysis).findings.filter((f) => f.id.startsWith('expectation.'));
    const auto = buildReport(analysis, { profile: 'auto' }).findings.filter((f) => f.id.startsWith('expectation.'));

    expect(observed).toHaveLength(0);
    expect(auto.length).toBeGreaterThan(5);
  });

  it('still rates a finding that does apply', async () => {
    // The other half: the invariant must not be satisfiable by rating everything info.
    const report = buildReport(await analyzeProject(path.join(fixturesDir, 'express-basic')));
    const severe = report.findings.filter(
      (finding) => finding.status !== 'passed' && finding.status !== 'unknown' && finding.severity !== 'info'
    );

    expect(severe.length).toBeGreaterThan(0);
  });
});
