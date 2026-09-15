import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { renderMarkdown } from '../src/report/markdownReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('business impact', () => {
  it('explains the consequence of every actionable finding', async () => {
    const analysis = await analyzeProject(fixture('nestjs-api'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });

    const actionable = report.findings.filter((finding) => finding.status !== 'passed' && finding.severity !== 'info');
    expect(actionable.length).toBeGreaterThan(0);
    expect(actionable.every((finding) => typeof finding.businessImpact === 'string')).toBe(true);
  });

  it('leaves passed checks without an impact statement', async () => {
    const analysis = await analyzeProject(fixture('express-secure'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });

    expect(report.passedChecks.every((finding) => finding.businessImpact === undefined)).toBe(true);
  });
});

describe('compliance mapping', () => {
  it('maps a missing erasure flow onto GDPR article 17', async () => {
    const analysis = await analyzeProject(fixture('nestjs-api'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });

    const erasure = report.compliance.find((entry) => entry.framework === 'gdpr' && entry.reference === 'Art. 17');
    expect(erasure).toBeDefined();
    expect(erasure!.met).toBe(false);
    expect(erasure!.findingIds.length).toBeGreaterThan(0);
  });

  it('omits obligations nothing maps to rather than reporting them met', async () => {
    const analysis = await analyzeProject(fixture('react-vite'));
    const report = buildReport(analysis, { profile: 'static-site' });

    // A static site profile touches almost nothing, so the mapping must stay small
    // rather than listing every framework article as satisfied.
    expect(report.compliance.length).toBeLessThan(6);
  });

  it('labels the mapping as advisory in the rendered report', async () => {
    const analysis = await analyzeProject(fixture('nestjs-api'));
    const markdown = renderMarkdown(buildReport(analysis, { profile: 'b2b-saas' }));

    expect(markdown).toContain('not a compliance certification');
  });
});
