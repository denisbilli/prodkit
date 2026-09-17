import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { renderMarkdown } from '../src/report/markdownReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The evidence appendix of a real report ran to 173 lines of 693 — a quarter of the
 * document — and one finding carried twenty-four snippets of which five were literally
 * `from django.contrib.auth.models import User`. Repetition does not make a case
 * stronger; it buries the case.
 */
describe('evidence a reader can read', () => {
  it('cites the same line once', async () => {
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'b2c-app' });

    for (const finding of report.findings) {
      const values = finding.evidence.map((e) => `${e.type}:${String(e.value).trim()}`);
      expect(new Set(values).size, `${finding.id} repeats a line`).toBe(values.length);
    }
  });

  it('counts what it does not show rather than dropping it quietly', async () => {
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'b2c-app' });
    const trimmed = report.findings.filter((f) => f.evidence.some((e) => /^and \d+ /.test(String(e.value))));

    for (const finding of trimmed) {
      expect(String(finding.evidence[finding.evidence.length - 1].value)).toMatch(/further distinct match|repeat/);
    }
  });

  it('shows where a thing turns up before how often one file says it', async () => {
    // Capping in detector order kept seven lines of Django settings boilerplate, four
    // of them password-validator names, and cut the line that settles the question.
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'b2c-app' });
    // The property is the ordering, not the cap: no file is cited a second time until
    // every file with something to say has been cited once.
    for (const finding of report.findings) {
      const files = finding.evidence.filter((e) => e.file).map((e) => e.file as string);
      const distinct = new Set(files);
      const lead = files.slice(0, distinct.size);

      expect(new Set(lead).size, `${finding.id} repeats a file before covering the others`).toBe(lead.length);
    }
  });

  it('changes no verdict', async () => {
    // Evidence quality and confidence are decided when a finding is built, before any
    // of this runs. Trimming what is displayed must never move a score.
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'b2b-saas' });
    const withSnippets = report.findings.filter((f) => f.evidence.some((e) => e.type === 'snippet' || e.type === 'file'));

    expect(withSnippets.length).toBeGreaterThan(0);
    for (const finding of withSnippets) {
      expect(finding.evidenceQuality, `${finding.id}`).toBe('strong');
    }
  });

  it('keeps the appendix a part of the report rather than most of it', async () => {
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'b2c-app' });
    const markdown = renderMarkdown(report);
    const total = markdown.split('\n').length;
    const appendix = markdown.slice(markdown.indexOf('## Appendix')).split('\n').length;

    expect(appendix / total).toBeLessThan(0.35);
  });
});
