import type { Finding, MaturityLevel } from './types';

const penaltyBySeverity: Record<Finding['severity'], number> = {
  critical: 15,
  high: 10,
  medium: 5,
  low: 2,
  info: 0,
};

export function computeScore(findings: Finding[]): number {
  let score = 100;
  for (const f of findings) {
    if (f.status === 'passed' || f.status === 'unknown') continue;
    score -= penaltyBySeverity[f.severity];
  }
  return Math.max(0, Math.min(100, score));
}

export function computeMaturity(score: number): MaturityLevel {
  if (score <= 39) return 'prototype';
  if (score <= 64) return 'early';
  if (score <= 84) return 'partial';
  return 'production_ready';
}
