import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const FIXTURES = path.resolve(__dirname, 'fixtures');

/**
 * "Taking payments: 1 check verified, nothing outstanding."
 *
 * Under a heading called "what already works", that told a reader their billing was in
 * good shape on the strength of one check. Forty-nine of ninety strengths across the
 * verification corpus read that way.
 *
 * "Nothing outstanding" means "no finding among the checks that ran". In a category
 * where one check ran and the rest did not, it is a sentence about this analyzer
 * rather than about the product — and it is the same claim, in the positive direction,
 * that this report refuses to make everywhere else.
 */
describe('a strength says how much of the area was checked', () => {
  const fixtures = fs
    .readdirSync(FIXTURES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it('never claims nothing is outstanding', async () => {
    const offenders: string[] = [];

    for (const name of fixtures) {
      let report;
      try {
        report = buildReport(await analyzeProject(path.join(FIXTURES, name)), { profile: 'auto' });
      } catch {
        continue;
      }
      for (const strength of report.executiveSummary.strengths) {
        if (/nothing outstanding/i.test(strength)) offenders.push(`${name}: ${strength}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('names what it did not assess, where anything went unassessed', async () => {
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'express-secure')), {
      profile: 'auto',
    });

    // Web security here has four checks that passed and two that reached no verdict.
    // The strength has to carry both numbers, or it reads as six out of six.
    expect(report.executiveSummary.strengths).toContain('basic web security: 4 checks verified, 2 not assessed');
  });

  it('says only what it verified where nothing went unassessed', async () => {
    // Was `permissions: 1 check verified`. This fixture has `requirePermission` on a
    // route and no per-record ownership check, and route-level checks stopped standing
    // in for per-record ones — so the authz category now carries a finding and is no
    // longer a strength. Configuration is, on one check, with nothing unassessed.
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'express-secure')), {
      profile: 'auto',
    });

    expect(report.executiveSummary.strengths).toContain('configuration and secrets: 1 check verified');
  });

  it('counts the checks that reached no verdict', async () => {
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'express-basic')), {
      profile: 'auto',
    });

    for (const entry of report.categoryScores) {
      const unknowns = report.findings.filter(
        (finding) => finding.category === entry.category && finding.status === 'unknown',
      ).length;

      expect(entry.unknownCount).toBe(unknowns);
    }
  });
})
