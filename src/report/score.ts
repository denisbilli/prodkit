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

/**
 * How much of this reading rests on something actually verified.
 *
 * `passed` is the number of checks that ran and found the thing they were looking for;
 * `assessed` is every check that reached a verdict either way.
 */
export interface ScoreCoverage {
  passed: number;
  assessed: number;
}

/**
 * The fewest passing checks that can support the words "production ready".
 *
 * A proportion alone is not enough: two passes out of three is 67% and is still almost
 * nothing.
 */
const MIN_VERIFIED_FOR_PRODUCTION = 6;

export function computeMaturity(score: number, coverage?: ScoreCoverage): MaturityLevel {
  if (score <= 39) return 'prototype';
  if (score <= 64) return 'early';
  if (score <= 84) return 'partial';

  /**
   * "Production ready" has to be earned, not defaulted into.
   *
   * The score starts at 100 and only ever subtracts, so a repository small enough that
   * almost no check applies to it keeps the 100 it was handed. A two-file static page
   * in the verification corpus was called production ready at 90/100 on the strength of
   * two passing checks out of nine, while the application it sat next to reached 94 on
   * twelve out of seventeen. The two numbers looked comparable and were not: one was
   * evidence, the other was silence.
   *
   * Absence of findings is not evidence of quality. The top band now requires the
   * report to be able to point at things it checked and found right.
   */
  if (coverage && (coverage.passed < MIN_VERIFIED_FOR_PRODUCTION || coverage.passed * 2 < coverage.assessed)) {
    return 'partial';
  }

  return 'production_ready';
}
