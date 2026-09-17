import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { buildCategoryScores } from '../src/report/categoryScores';
import type { Finding } from '../src/report/types';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

function finding(over: Partial<Finding>): Finding {
  return {
    id: 'x', title: 'x', category: 'security', status: 'missing', severity: 'high', stakes: 'high',
    description: '', recommendation: '', evidence: [], confidence: 'high', evidenceQuality: 'strong',
    ...over,
  } as Finding;
}

/**
 * The old score started at 100 and subtracted a fixed weight per finding. Two `high`
 * findings reached 90 of a possible 100, so a category with two problems and one with
 * eight both read 0 — and the table whose whole job is to say where to look could not
 * rank anything. It also could not see a passing check: a real PHP product read 0/100
 * for security on three findings, none of them critical, with a verified control
 * sitting in the same category.
 */
describe('how much of what is at stake is wrong', () => {
  it('tells two problems apart from eight', () => {
    const two = buildCategoryScores([
      finding({ id: 'a' }), finding({ id: 'b' }),
      ...Array.from({ length: 6 }, (_, i) => finding({ id: `p${i}`, status: 'passed', severity: 'info' })),
    ]).find((c) => c.category === 'security')!;

    const eight = buildCategoryScores(
      Array.from({ length: 8 }, (_, i) => finding({ id: `f${i}` })),
    ).find((c) => c.category === 'security')!;

    expect(two.score).toBeGreaterThan(eight.score);
  });

  it('sees a control that was verified', () => {
    const scores = buildCategoryScores([
      finding({ id: 'ok', status: 'passed', severity: 'info', stakes: 'critical' }),
      finding({ id: 'a' }), finding({ id: 'b' }), finding({ id: 'c', severity: 'medium', stakes: 'medium' }),
    ]).find((c) => c.category === 'security')!;

    expect(scores.score).toBeGreaterThan(0);
    expect(scores.verifiedCount).toBe(1);
    expect(scores.assessedCount).toBe(4);
  });

  it('does not let one unresolved critical hide behind nine passing checks', () => {
    // The original design was right about this, and the proportion alone would lose it.
    const scores = buildCategoryScores([
      finding({ id: 'bad', severity: 'critical', stakes: 'critical' }),
      ...Array.from({ length: 9 }, (_, i) => finding({ id: `p${i}`, status: 'passed', severity: 'info', stakes: 'medium' })),
    ]).find((c) => c.category === 'security')!;

    expect(scores.score).toBeLessThanOrEqual(20);
  });

  it('does not count what it could not tell', () => {
    const scores = buildCategoryScores([
      finding({ id: 'u', status: 'unknown', severity: 'info', stakes: 'high' }),
      finding({ id: 'ok', status: 'passed', severity: 'info', stakes: 'high' }),
    ]).find((c) => c.category === 'security')!;

    expect(scores.assessedCount).toBe(1);
    expect(scores.score).toBe(100);
  });
});

describe('what a check is worth survives its outcome', () => {
  it('keeps the stakes of a control that passed', async () => {
    // `severity` drops to `info` the moment a check passes, which is right for a list of
    // problems and wrong for measuring how much of a category is in good order.
    const report = buildReport(await analyzeProject(fixture('express-secure')), { profile: 'b2b-saas' });
    const passed = report.findings.filter((f) => f.status === 'passed');

    expect(passed.length).toBeGreaterThan(0);
    expect(passed.some((f) => f.stakes !== 'info')).toBe(true);
  });

  it('changes no overall score', async () => {
    // The category table is presentational; the number on the front page is not.
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'b2b-saas' });

    expect(report.overallScore).toBe(
      Math.max(0, Math.min(100, Math.round((report.observedScore * 0.6) + ((report.expectedCapabilityScore ?? 0) * 0.4)))),
    );
  });
});

describe('what already works describes work', () => {
  it('does not report a strength as an absence', async () => {
    // "No issues found in configuration and secrets" is the same sentence a report
    // would print if it had not looked, and the reader cannot tell those apart.
    const report = buildReport(await analyzeProject(fixture('express-secure')), { profile: 'b2b-saas' });

    for (const strength of report.executiveSummary.strengths) {
      expect(strength).not.toMatch(/^no issues found/);
      expect(strength).toMatch(/verified/);
    }
  });
});
