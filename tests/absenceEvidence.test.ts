import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * An independent review of a real report: eleven findings of thirty-two carried "no
 * direct evidence captured". A finding about something that is not there has no line to
 * cite — but that sentence reads like "we did not look", and the reader cannot tell the
 * difference. The evidence for an absence is the search that found nothing, and the
 * detectors already know what they searched for.
 */
describe('the evidence for an absence is the search', () => {
  it('says what it looked for instead of saying nothing', async () => {
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'b2c-app' });
    const erasure = report.findings.find((f) => f.id === 'expectation.gdpr.erasure.required');

    expect(erasure?.status).toBe('missing');
    expect(erasure?.evidence.some((e) => e.type === 'search')).toBe(true);
    expect(erasure?.evidence.map((e) => String(e.value)).join(' ')).toMatch(/right to be forgotten/i);
  });

  it('leaves most findings with something to check', async () => {
    // A reader whose erasure endpoint is called `purgeSubject` can see in one line why
    // it was missed, and say so. That is the difference between a claim and an
    // assertion.
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'b2c-app' });
    const open = report.findings.filter((f) => f.status !== 'passed' && f.status !== 'unknown');
    const bare = open.filter((f) => f.evidence.every((e) => e.type === 'note'));

    expect(open.length).toBeGreaterThan(4);
    expect(bare.length / open.length).toBeLessThan(0.4);
  });

  it('does not let a search that found nothing pass for evidence', async () => {
    // A search record is weak by construction: it is the absence of a match. If it
    // raised evidence quality it would raise confidence, and an absence would become
    // critical again.
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'b2c-app' });

    for (const finding of report.findings) {
      const onlySearches = finding.evidence.length > 0
        && finding.evidence.every((e) => e.type === 'search' || e.type === 'note');
      if (!onlySearches) continue;

      expect(finding.evidenceQuality, `${finding.id}`).toBe('weak');
      expect(finding.severity, `${finding.id}`).not.toBe('critical');
    }
  });

  it('does not read a search record as the thing it names', async () => {
    // "searched for cross-origin configuration: cors(, Access-Control-Allow-Origin"
    // contains every word a check for cross-origin handling looks for. A
    // server-rendered Django monolith was asked for a cross-origin policy on the
    // strength of the report's own account of not finding one — the same trap as
    // reading STRIPE_LEN out of a hash implementation. A string is not the thing it
    // names.
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'b2c-app' });
    const cors = report.findings.filter((f) => /CORS/i.test(f.title) && f.status === 'missing');

    expect(cors).toEqual([]);
  });
});
