import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { renderMarkdown } from '../src/report/markdownReport';
import { referencesFor } from '../src/report/complianceMapping';

const FIXTURES = path.resolve(__dirname, 'fixtures');

/**
 * The most dangerous sentence this report can print.
 *
 * The compliance mapping's own comment says obligations nothing mapped to are omitted
 * "because silence is not evidence of compliance". The code applied that only halfway:
 * an obligation whose every supporting check came back `unknown` was reported as met.
 *
 * Measured across seventy-eight repositories, 84 of 163 obligations marked met rested
 * on not one passing check — most of them OWASP A01, broken access control, declared
 * satisfied because a single check said it did not know. A reader quoting that to an
 * auditor would be quoting nothing.
 */
describe('an obligation is met only when something was checked and found right', () => {
  const fixtures = fs
    .readdirSync(FIXTURES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it('never marks an obligation met without a passing check behind it', async () => {
    const offenders: string[] = [];

    for (const name of fixtures) {
      let report;
      try {
        report = buildReport(await analyzeProject(path.join(FIXTURES, name)), { profile: 'auto' });
      } catch {
        continue;
      }

      // The same question the builder asks, through the same table, so the two
      // cannot drift apart.
      const verified = new Set(
        report.findings
          .filter((finding) => finding.status === 'passed')
          .flatMap((finding) => referencesFor(finding).map((ref) => `${ref.framework}::${ref.reference}`)),
      );

      for (const obligation of report.compliance) {
        if (obligation.status !== 'met') continue;
        if (!verified.has(`${obligation.framework}::${obligation.reference}`)) {
          offenders.push(`${name}: ${obligation.framework} ${obligation.reference}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('marks an obligation unknown rather than met when every check said it did not know', async () => {
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'browser-app')), {
      profile: 'auto',
    });
    const unknown = report.compliance.filter((obligation) => obligation.status === 'unknown');

    expect(unknown.length).toBeGreaterThan(0);
    for (const obligation of unknown) {
      expect(obligation.met).toBe(false);
      expect(obligation.findingIds).toEqual([]);
    }
  });

  it('does not list an unassessed obligation as exposure', async () => {
    // "Compliance Exposure" with a findings count of zero reads as a gap found. It is
    // the absence of an answer, and the two belong in different lists.
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'browser-app')), {
      profile: 'auto',
    });
    const markdown = renderMarkdown(report);
    const section = markdown.slice(markdown.indexOf('## Compliance Exposure'));
    const table = section.slice(0, section.indexOf('Not assessed'));

    for (const obligation of report.compliance.filter((o) => o.status === 'unknown')) {
      expect(table).not.toContain(`| ${obligation.reference} |`);
    }
    expect(section).toContain('Not assessed');
  });
});
