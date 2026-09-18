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

/**
 * The highest score a report can reach when it may not claim the top band.
 *
 * The band boundary itself, deliberately: a report that cannot support the words
 * "production ready" must not print a number that reads like it either. Two things bar
 * the top band — evidence too thin to support it, and an unresolved critical — and both
 * land here.
 */
export const TOP_BAND_CEILING = 84;

/**
 * Whether the report checked enough to stand behind a top-band reading.
 *
 * Its own function because two things ask the question — the label and the number — and
 * they were answering it differently. A repository small enough that almost nothing
 * applies to it was labelled `partial` and scored 98, above every real product in the
 * corpus; the label had learned that absence of findings is not evidence of quality and
 * the score had not.
 */
export function coverageSupportsTopBand(coverage: ScoreCoverage): boolean {
  return coverage.passed >= MIN_VERIFIED_FOR_PRODUCTION && coverage.passed * 2 >= coverage.assessed;
}

/**
 * Whether a report may print a top-band number at all.
 *
 * The single place the two bars are stated, so the score and the label cannot drift
 * apart again: they did, and the number went on reading 98 above every real product in
 * the corpus while the label said `partial`.
 */
export function mayClaimTopBand(coverage: ScoreCoverage, openCriticals: number): boolean {
  return coverageSupportsTopBand(coverage) && openCriticals === 0;
}

/**
 * How many critical findings are open.
 *
 * A separate argument rather than something derived from the score, because the score
 * subtracts a fixed weight and then moves on: a project with forty-two passing checks
 * and one unresolved critical came out at 91 and was called production ready. The
 * category scores have refused to let a critical hide behind passing checks since the
 * severity ceiling was added — "a category with one critical and nine passing checks is
 * not 90% healthy" — and the report's own headline had not learned it.
 */
export function computeMaturity(
  score: number,
  coverage?: ScoreCoverage,
  openCriticals = 0,
): MaturityLevel {
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
  if (coverage && !coverageSupportsTopBand(coverage)) {
    return 'partial';
  }

  // Nothing is production ready while something critical is open in it. This is the one
  // claim in the report a reader acts on without reading further.
  if (openCriticals > 0) return 'partial';

  return 'production_ready';
}
