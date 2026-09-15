import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import type { ProductProfile } from '../src/expectations/types';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Ordered from the least demanding profile to the most demanding one. Every
 * assertion below relies on this order, because the product claim is that asking
 * a harder question of the same repository must produce a lower score.
 */
const PROFILES_BY_DEMAND: Array<Exclude<ProductProfile, 'auto' | 'observed-only'>> = [
  'static-site',
  'internal-tool',
  'b2c-app',
  'b2b-saas',
  'ai-saas',
];

async function scoresFor(fixtureName: string) {
  const analysis = await analyzeProject(fixture(fixtureName));

  return PROFILES_BY_DEMAND.map((profile) => {
    const report = buildReport(analysis, { profile });
    return {
      profile,
      overall: report.overallScore,
      expected: report.expectedCapabilityScore ?? 0,
      gap: report.productProfile?.gap,
    };
  });
}

describe('product profile differentiation', () => {
  // Regression guard for the scoring collapse: `100 - penalty` clamped at zero made
  // every demanding profile report an identical score, because b2b-saas and above
  // accumulate more than 100 points of penalty on a repository that satisfies nothing.
  it('separates profiles on a repository that satisfies nothing', async () => {
    const scores = await scoresFor('nestjs-api');
    const expected = scores.map((entry) => entry.expected);

    expect(new Set(expected).size).toBe(expected.length);
    expect(Math.min(...expected)).toBeGreaterThan(0);
  });

  it('separates profiles on a repository that satisfies most expectations', async () => {
    const scores = await scoresFor('express-secure');
    const overall = scores.map((entry) => entry.overall);

    expect(new Set(overall).size).toBeGreaterThan(1);
  });

  it('scores a repository lower as the profile becomes more demanding', async () => {
    for (const fixtureName of ['nestjs-api', 'express-secure', 'react-vite']) {
      const scores = await scoresFor(fixtureName);

      for (let index = 1; index < scores.length; index += 1) {
        expect(scores[index].expected).toBeLessThanOrEqual(scores[index - 1].expected);
      }
    }
  });

  it('never saturates the expected score to zero', async () => {
    for (const fixtureName of ['nestjs-api', 'react-vite', 'unknown-project']) {
      const scores = await scoresFor(fixtureName);

      for (const entry of scores) {
        expect(entry.expected).toBeGreaterThan(0);
      }
    }
  });

  it('reports a gap whose size grows with profile demand', async () => {
    const scores = await scoresFor('nestjs-api');
    const staticSite = scores.find((entry) => entry.profile === 'static-site');
    const aiSaas = scores.find((entry) => entry.profile === 'ai-saas');

    expect(staticSite?.gap?.requiredTotal ?? 0).toBeLessThan(aiSaas?.gap?.requiredTotal ?? 0);
    expect(aiSaas?.gap?.applicableTotal ?? 0).toBeGreaterThan(staticSite?.gap?.applicableTotal ?? 0);
  });

  it('counts satisfied capabilities separately from the score', async () => {
    const analysis = await analyzeProject(fixture('express-secure'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });
    const gap = report.productProfile?.gap;

    expect(gap).toBeDefined();
    expect(gap!.satisfied).toBeGreaterThan(0);
    expect(gap!.satisfied).toBeLessThanOrEqual(gap!.applicableTotal);
    expect(gap!.requiredMissing + gap!.requiredPartial).toBeLessThanOrEqual(gap!.requiredTotal);
  });
});
