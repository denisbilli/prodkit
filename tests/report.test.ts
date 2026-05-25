import { describe, expect, it } from 'vitest';
import { computeMaturity, computeScore } from '../src/report/score';

describe('score', () => {
  it('applies deterministic penalties and clamp', () => {
    const score = computeScore([
      { id: 'a', title: 'a', category: 'security', severity: 'critical', status: 'missing', description: '', evidence: [], recommendation: '' },
      { id: 'b', title: 'b', category: 'security', severity: 'high', status: 'missing', description: '', evidence: [], recommendation: '' },
      { id: 'c', title: 'c', category: 'security', severity: 'medium', status: 'partial', description: '', evidence: [], recommendation: '' },
      { id: 'd', title: 'd', category: 'security', severity: 'low', status: 'missing', description: '', evidence: [], recommendation: '' },
      { id: 'e', title: 'e', category: 'security', severity: 'info', status: 'missing', description: '', evidence: [], recommendation: '' },
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
