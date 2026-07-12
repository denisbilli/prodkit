import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { computeMaturity, computeScore } from '../src/report/score';

describe('score', () => {
  it('applies deterministic penalties and clamp', () => {
    const score = computeScore([
      { id: 'a', title: 'a', category: 'security', severity: 'critical', status: 'missing', description: '', evidence: [], recommendation: '', confidence: 'low', evidenceQuality: 'weak' },
      { id: 'b', title: 'b', category: 'security', severity: 'high', status: 'missing', description: '', evidence: [], recommendation: '', confidence: 'low', evidenceQuality: 'weak' },
      { id: 'c', title: 'c', category: 'security', severity: 'medium', status: 'partial', description: '', evidence: [], recommendation: '', confidence: 'low', evidenceQuality: 'weak' },
      { id: 'd', title: 'd', category: 'security', severity: 'low', status: 'missing', description: '', evidence: [], recommendation: '', confidence: 'low', evidenceQuality: 'weak' },
      { id: 'e', title: 'e', category: 'security', severity: 'info', status: 'missing', description: '', evidence: [], recommendation: '', confidence: 'low', evidenceQuality: 'weak' },
    ]);
    expect(score).toBe(68);
  });

  it('maps maturity bands', () => {
    expect(computeMaturity(20)).toBe('prototype');
    expect(computeMaturity(50)).toBe('early');
    expect(computeMaturity(70)).toBe('partial');
    expect(computeMaturity(90)).toBe('production_ready');
  });
});

describe('inconclusive assessment', () => {
  it('caps the score of an unrecognizable project at prototype', async () => {
    const analysis = await analyzeProject(path.resolve(__dirname, 'fixtures', 'unknown-project'));
    const report = buildReport(analysis);

    expect(report.inconclusive).toBe(true);
    expect(report.inconclusiveReasons.length).toBeGreaterThan(0);
    expect(report.overallScore).toBeLessThanOrEqual(39);
    expect(report.maturityLevel).toBe('prototype');
  });

  it('does not mark a recognized project as inconclusive', async () => {
    const analysis = await analyzeProject(path.resolve(__dirname, 'fixtures', 'express-basic'));
    const report = buildReport(analysis);

    expect(report.inconclusive).toBe(false);
    expect(report.inconclusiveReasons).toEqual([]);
  });
});
