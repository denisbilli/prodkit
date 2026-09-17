import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * An independent review of a real Django project found the same four
 * `SECURE_HSTS_SECONDS` lines cited as the evidence for missing rate limiting, for
 * CORS, for DEBUG and for cookie flags — forty-four reused items in one report. A
 * reader who opens "no rate limiting" and finds an HSTS line stops believing the rest
 * of the page, and they are right to.
 */
describe('evidence belongs to the claim it supports', () => {
  it('does not offer a security header as evidence about rate limiting', async () => {
    const report = buildReport(await analyzeProject(fixture('django-secure-cookies-conditional')), { profile: 'auto' });

    for (const finding of report.findings) {
      if (!/rate-limit|rate\.limit/.test(finding.id)) continue;

      for (const item of finding.evidence) {
        expect(String(item.value), `${finding.id} cites a header as rate-limit evidence`)
          .not.toMatch(/SECURE_HSTS|Strict-Transport-Security|Content-Security-Policy/i);
      }
    }
  });

  it('does not offer a log line as evidence about a health endpoint', async () => {
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'auto' });
    const health = report.findings.filter((f) => f.id.includes('observability.health'));

    for (const finding of health) {
      for (const item of finding.evidence) {
        expect(String(item.value), `${finding.id} cites a log line as health evidence`)
          .not.toMatch(/logger\.(info|warn|error|debug)/);
      }
    }
  });

  it('counts far less evidence across unrelated claims than it used to', async () => {
    const report = buildReport(await analyzeProject(fixture('django-debug-from-env')), { profile: 'auto' });

    const byLine = new Map<string, Set<string>>();
    for (const finding of report.findings) {
      for (const item of finding.evidence) {
        if (item.type === 'note') continue;

        const key = `${item.file ?? ''}:${item.line ?? ''}:${item.value}`;
        // An expectation and the observed rule for the same subject are two views of
        // one claim, not reuse, so they are folded together before counting.
        const subject = finding.id.replace(/^expectation\./, '').split('.').slice(0, 2).join('.');
        if (!byLine.has(key)) byLine.set(key, new Set());
        byLine.get(key)!.add(subject);
      }
    }

    const reused = [...byLine.values()].filter((subjects) => subjects.size > 1);
    expect(reused).toHaveLength(0);
  });

  it('still shows the evidence of a detector that tags nothing', async () => {
    // The filter falls back to untagged evidence, so a detector that has not been given
    // claims behaves exactly as it did.
    const report = buildReport(await analyzeProject(fixture('express-secure')), { profile: 'auto' });
    const withEvidence = report.findings.filter((f) => f.evidence.some((e) => e.type !== 'note'));

    expect(withEvidence.length).toBeGreaterThan(0);
  });
});
