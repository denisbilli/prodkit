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
  it.each(fixtures)('%s reports no severe finding that does not apply', async (fixture) => {
    const report = buildReport(await analyzeProject(path.join(fixturesDir, fixture)));

    const contradictions = report.findings
      .filter((finding) => finding.status === 'unknown' && finding.severity !== 'info')
      .map((finding) => `${finding.id} is ${finding.severity} while unknown`);

    expect(contradictions).toEqual([]);
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
