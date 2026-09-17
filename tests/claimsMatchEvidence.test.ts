import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Read end to end, as somebody who paid for it would, a report contradicted itself in
 * three places on the same page. These are those three.
 */
describe('a report does not contradict itself', () => {
  it('does not announce strong evidence above the words "no direct evidence captured"', async () => {
    // Evidence quality was graded on the detectors whole while the finding displayed
    // only the lines carrying its own claim. The two came apart the moment claims were
    // introduced: the one critical finding in a real report — the finding that decided
    // "launch ready: no" — announced high confidence and strong evidence quality
    // directly above that line. It had been graded on four SECURE_HSTS_SECONDS
    // snippets it no longer showed, because they are evidence about headers.
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'b2c-app' });

    for (const finding of report.findings) {
      const real = finding.evidence.filter((item) => item.type !== 'note');
      if (real.length > 0) continue;

      expect(finding.evidenceQuality, `${finding.id} has no evidence and calls it ${finding.evidenceQuality}`).toBe('weak');
    }
  });

  it('says critical only where it can point at the line', async () => {
    // An absence has nothing to point at — there is no line for something that is not
    // there — so it is reported as a gap to close, not as a reason to stop the launch.
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'b2b-saas' });

    for (const finding of report.criticalIssues) {
      const real = finding.evidence.filter((item) => item.type !== 'note');
      expect(real.length, `${finding.id} is critical with nothing to show`).toBeGreaterThan(0);
    }
  });

  it('still calls a committed secret critical', async () => {
    // The rule above must not quietly empty the top band: a hardcoded signing key is
    // exactly the case where there is a line to point at.
    const report = buildReport(await analyzeProject(fixture('django-debug-from-env')), { profile: 'b2c-app' });
    const observed = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'b2b-saas' });

    expect(observed.criticalIssues.some((f) => f.id === 'security.weak-secret')).toBe(true);
    expect(report.findings.length).toBeGreaterThan(0);
  });

  it('does not describe a consequence of a problem it did not find', async () => {
    // A Django project was told, three lines apart, that the security-headers check is
    // about Express middleware and does not apply — and then that "the browser is not
    // told to defend the page". An upload check that found nothing exposed still
    // announced that uploaded files are reachable by anyone who guesses the path.
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'b2c-app' });

    for (const finding of report.findings) {
      if (finding.status === 'missing' || finding.status === 'partial') continue;

      expect(finding.businessImpact, `${finding.id} is ${finding.status} and states an impact`).toBeUndefined();
    }
  });

  it('does not tell a Django project to install an Express package', async () => {
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'b2c-app' });
    const headers = report.findings.find((f) => f.id === 'security.helmet');

    expect(headers?.description).toMatch(/django/i);
    expect(headers?.recommendation).not.toMatch(/helmet\(\)/);
  });
});
