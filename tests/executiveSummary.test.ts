import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { renderMarkdown } from '../src/report/markdownReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('executive summary', () => {
  it('states a verdict a non-technical reader can act on', async () => {
    const analysis = await analyzeProject(fixture('nestjs-api'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });
    const summary = report.executiveSummary;

    expect(summary.launchReady).toBe(false);
    expect(summary.verdict).toContain('B2B SaaS');
    expect(summary.estimatedEffort).toMatch(/week/i);
    expect(summary.scoreExplanation).toContain('100');
  });

  it('reports launch readiness when nothing required is missing', async () => {
    // Judged as `static-site` before, which requires nothing at all — so this passed
    // before anything was measured. `internal-tool` states one requirement and this
    // fixture meets it, which is the case the test is named for.
    const analysis = await analyzeProject(fixture('express-secure'));
    const report = buildReport(analysis, { profile: 'internal-tool' });

    expect(report.productProfile?.gap.requiredTotal).toBeGreaterThan(0);
    expect(report.executiveSummary.launchReady).toBe(true);
  });

  it('does not report launch readiness against a profile that requires nothing', async () => {
    // `static-site` marks every capability recommended or optional, so "nothing
    // required is missing" is true before anything is measured. Five static sites in
    // the verification corpus were told they covered everything expected of them
    // while satisfying one applicable capability out of six.
    const analysis = await analyzeProject(fixture('express-secure'));
    const report = buildReport(analysis, { profile: 'static-site' });

    expect(report.productProfile?.gap.requiredTotal).toBe(0);
    expect(report.executiveSummary.launchReady).toBeNull();
    expect(report.executiveSummary.verdict).not.toMatch(/covers everything expected/i);
    expect(report.executiveSummary.verdict).toMatch(/Nothing is strictly required/i);
  });

  it('scales the effort estimate with the size of the gap', async () => {
    const analysis = await analyzeProject(fixture('nestjs-api'));
    const light = buildReport(analysis, { profile: 'internal-tool' }).executiveSummary.estimatedEffort;
    const heavy = buildReport(analysis, { profile: 'ai-saas' }).executiveSummary.estimatedEffort;

    expect(light).not.toEqual(heavy);
  });

  it('explains an inconclusive analysis instead of reporting a score', async () => {
    const analysis = await analyzeProject(fixture('unknown-project'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });

    if (report.inconclusive) {
      expect(report.executiveSummary.verdict).toMatch(/could not judge this project/i);
      // This asserted `false`, which the interface rendered as an amber "Not launch
      // ready" badge directly under a verdict saying the project could not be judged.
      // One of the two is a verdict about the product; the other is the absence of one.
      expect(report.executiveSummary.launchReady).toBeNull();
      expect(report.executiveSummary.strengths).toEqual([]);
    }
  });

  it('leads the markdown report with the summary, before the stack', async () => {
    const analysis = await analyzeProject(fixture('nestjs-api'));
    const markdown = renderMarkdown(buildReport(analysis, { profile: 'b2b-saas' }));

    expect(markdown.indexOf('## Summary')).toBeGreaterThan(-1);
    expect(markdown.indexOf('## Summary')).toBeLessThan(markdown.indexOf('## Detected Stack'));
    expect(markdown).toContain('## Readiness by Area');
  });
});

describe('category scores', () => {
  it('scores each category independently', async () => {
    const analysis = await analyzeProject(fixture('express-secure'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });

    expect(report.categoryScores.length).toBeGreaterThan(5);
    const scores = new Set(report.categoryScores.map((entry) => entry.score));
    expect(scores.size).toBeGreaterThan(1);
  });

  it('never reports open findings on a category scored 100', async () => {
    const analysis = await analyzeProject(fixture('nestjs-api'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });

    for (const entry of report.categoryScores) {
      if (entry.score === 100) expect(entry.findingCount).toBe(0);
    }
  });

  it('marks a category with no findings at all as not assessed', async () => {
    const analysis = await analyzeProject(fixture('react-vite'));
    const report = buildReport(analysis, { profile: 'static-site' });

    const notAssessed = report.categoryScores.filter((entry) => entry.notAssessed);
    expect(notAssessed.length).toBeGreaterThan(0);
    expect(notAssessed.every((entry) => entry.findingCount === 0)).toBe(true);
  });
});
