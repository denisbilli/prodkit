import { readdirSync } from 'node:fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const FIXTURES = path.resolve(__dirname, 'fixtures');
const fixture = (name: string) => path.join(FIXTURES, name);

/**
 * A sentence that fits two different answers is not an answer.
 *
 * "Privacy/GDPR signals detected or not applicable from available evidence" was
 * corrected once, and the rule directly above it still said "Environment template looks
 * available or env usage was not detected" — shown to sixty-two of the seventy-eight
 * repositories in the verification corpus: nineteen that have a template, forty-three
 * that read no environment variables at all. Those call for opposite actions, and the
 * reader cannot tell which they are.
 *
 * So this is a rule rather than another one-off correction: whatever a check says, it
 * may not say the same thing when the answer is different.
 *
 * Nine checks were straddling when the rule was written. The fixture corpus catches
 * seven of them; the last two — `docker.presence` saying "Docker signals found" for both
 * a complete set and half of one, and the privacy check's positive sentence appearing
 * under `unknown` — showed up only against the repositories on the machine this was
 * written on. So this test is a floor, not a proof, and the sweep over real projects is
 * still worth running.
 */
describe('a description belongs to one status', () => {
  it('never reuses a sentence across two different verdicts', async () => {
    const seen = new Map<string, Map<string, string[]>>();

    for (const name of readdirSync(FIXTURES, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const report = buildReport(await analyzeProject(path.join(FIXTURES, name.name)), { profile: 'auto' });

      for (const finding of report.findings) {
        const byDescription = seen.get(finding.id) ?? new Map<string, string[]>();
        const statuses = byDescription.get(finding.description) ?? [];
        if (!statuses.includes(finding.status)) statuses.push(finding.status);
        byDescription.set(finding.description, statuses);
        seen.set(finding.id, byDescription);
      }
    }

    const straddling: string[] = [];
    for (const [findingId, byDescription] of seen) {
      for (const [description, statuses] of byDescription) {
        if (statuses.length > 1) {
          straddling.push(`${findingId} says "${description.slice(0, 70)}…" for ${statuses.join(' and ')}`);
        }
      }
    }

    expect(straddling).toEqual([]);
  });
});

/**
 * A row that says "0 critical" must not be scored as though one were open.
 *
 * `stakes` is what a capability is worth before confidence is folded in; `severity` is
 * what the report is willing to claim about it. The category ceiling used stakes, so a
 * Django project with four of five security checks verified and one `high` finding open
 * scored 20 of 100 — the critical ceiling — in a table row whose own critical column read
 * zero, below an area with one of three verified.
 */
describe('a category score and the row it sits in agree', () => {
  it('does not cap an area at the critical ceiling when nothing critical is open', async () => {
    const report = buildReport(await analyzeProject(fixture('django-security-headers')), { profile: 'b2c-app' });
    const security = report.categoryScores.find((entry) => entry.category === 'security');

    const openSeverities = report.findings
      .filter((f) => f.category === 'security' && f.status !== 'passed' && f.status !== 'unknown')
      .map((f) => f.severity);

    expect(openSeverities).not.toContain('critical');
    expect(security?.criticalCount).toBe(0);
    expect(security?.score).toBeGreaterThan(20);
  });

  it('still sinks an area that has a critical open', async () => {
    // The ceiling exists so one unresolved critical cannot hide behind passing checks.
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'auto' });
    const security = report.categoryScores.find((entry) => entry.category === 'security');

    expect(security?.criticalCount).toBeGreaterThan(0);
    expect(security?.score).toBeLessThanOrEqual(20);
  });
});
