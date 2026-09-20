import type { Category, Finding, Severity } from './types';

export interface CategoryScore {
  category: Category;
  /** 0-100. 100 means nothing actionable was found in this category. */
  /**
   * `null` where nothing in the analysis touched this category.
   *
   * `notAssessed` has been beside it for a while and the number went on saying 100.
   * On a report with no overall score at all, twelve categories still read 100 of 100
   * — a repository the analyzer could not read, presented as perfect in twelve areas.
   */
  score: number | null;
  findingCount: number;
  /** Checks that ran and found what they were looking for. */
  verifiedCount: number;
  /** Checks that reached a verdict either way. */
  assessedCount: number;
  criticalCount: number;
  highCount: number;
  /** True when nothing in the analysis touched this category, so the score is not evidence of health. */
  notAssessed: boolean;
}

/**
 * Per-severity weight used to score a category.
 *
 * A single critical finding should sink a category on its own — a category with one
 * critical and nine passing checks is not 90% healthy — so the critical weight alone
 * exceeds the maximum score.
 */
const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 120,
  high: 45,
  medium: 18,
  low: 7,
  info: 0,
};

/** Categories that describe the analysis itself rather than a property of the product. */
/**
 * The most a category can score while a finding of this severity is open.
 *
 * Read as: an unresolved critical means the area is not in good order however much else
 * is, and the same in smaller measure down the scale.
 */
const SEVERITY_CEILING: Record<Severity, number> = {
  critical: 20,
  high: 50,
  medium: 75,
  low: 90,
  info: 100,
};

const NON_PRODUCT_CATEGORIES: ReadonlySet<Category> = new Set<Category>(['meta', 'stack']);

export const SCORED_CATEGORIES: readonly Category[] = [
  'auth',
  'authz',
  'tenancy',
  'gdpr',
  'security',
  'uploads',
  'billing',
  'audit',
  'observability',
  'jobs',
  'deployment',
  'env',
];

/**
 * Scores each category independently so a report can show where a product is weak,
 * not only how weak it is overall. A single number cannot distinguish a repository
 * with solid auth and no observability from its mirror image, and those two need
 * completely different work.
 */
export function buildCategoryScores(findings: Finding[]): CategoryScore[] {
  return SCORED_CATEGORIES.filter((category) => !NON_PRODUCT_CATEGORIES.has(category)).map((category) => {
    const categoryFindings = findings.filter((finding) => finding.category === category);
    // `info` findings carry no weight, so counting them would report a category as
    // having open work while scoring it a clean 100.
    const actionable = categoryFindings.filter(
      (finding) => finding.status !== 'passed' && finding.severity !== 'info',
    );

    /**
     * How much of what is at stake here is wrong.
     *
     * The old score started at 100 and subtracted a fixed weight per finding, which
     * saturated almost immediately — two `high` findings reached 90 of a possible 100,
     * so a category with two problems and a category with eight both read 0, and the
     * table whose whole job is to say where to look could not rank anything. It also
     * could not see a passing check: a real PHP product read 0/100 for security on
     * three findings, none of them critical, with a verified control sitting in the
     * same category.
     *
     * Both fall out of asking the question the other way round. Every assessed check
     * puts its own weight at stake; the score is the share of that weight not currently
     * failing. A category where the critical control holds and three lesser ones do not
     * is no longer indistinguishable from one where nothing holds at all.
     */
    const assessed = categoryFindings.filter((finding) => finding.status !== 'unknown');
    const atStake = assessed.reduce((total, finding) => total + SEVERITY_WEIGHT[finding.stakes], 0);
    const failing = actionable.reduce((total, finding) => total + SEVERITY_WEIGHT[finding.stakes], 0);

    const proportional = atStake === 0 ? 100 : Math.round(100 * (1 - failing / atStake));

    /**
     * Nothing looks healthy while something severe is open.
     *
     * The proportion on its own would let one unresolved critical hide behind nine
     * passing checks, and the original design was right that "a category with one
     * critical and nine passing checks is not 90% healthy". The cap keeps that;
     * the proportion does the ranking underneath it.
     */
    /**
     * The ceiling follows what the report says is wrong, not what the area is worth.
     *
     * These are two different numbers on purpose: `stakes` is what a capability is worth
     * before confidence is folded in, and `severity` is what the report is willing to
     * claim about it. Using stakes here capped a category at the critical ceiling while
     * the row beside it read "0 critical" — a Django project with four of five security
     * checks verified and one high finding open scored 20 of 100, below an area with one
     * of three verified.
     *
     * The proportion below still uses stakes, which is right: how much of what is at
     * stake is failing does not change because the report hedged. What changes is the
     * cap, and a cap that says "nothing looks healthy while something severe is open"
     * has to mean the severity the reader was shown.
     */
    const worstOpen = actionable.reduce<Severity>(
      (worst, finding) => (SEVERITY_WEIGHT[finding.severity] > SEVERITY_WEIGHT[worst] ? finding.severity : worst),
      'info',
    );
    const ceiling = SEVERITY_CEILING[worstOpen];
    const notAssessed = categoryFindings.every((finding) => finding.status === 'unknown');

    return {
      category,
      score: notAssessed ? null : Math.max(0, Math.min(100, proportional, ceiling)),
      findingCount: actionable.length,
      /** Checks in this category that ran and found what they were looking for. */
      verifiedCount: assessed.filter((finding) => finding.status === 'passed').length,
      /** Checks in this category that reached a verdict either way. */
      assessedCount: assessed.length,
      criticalCount: actionable.filter((finding) => finding.severity === 'critical').length,
      highCount: actionable.filter((finding) => finding.severity === 'high').length,
      /**
       * "I don't know" is not an assessment.
       *
       * This was `categoryFindings.length === 0`, so a single `info` finding with
       * status `unknown` — the analyzer recording that it could not tell — made the
       * category count as assessed, with zero actionable findings and a score of 100.
       * A Django school platform with no payments anywhere was reported as having
       * "no issues found in taking payments", as a strength.
       */
      notAssessed,
    };
  });
}

/** The categories dragging the report down most, worst first. */
export function weakestCategories(scores: CategoryScore[], limit = 3): CategoryScore[] {
  return [...scores]
    .filter((entry) => !entry.notAssessed && entry.findingCount > 0)
    .sort((left, right) => (left.score ?? 100) - (right.score ?? 100) || right.criticalCount - left.criticalCount)
    .slice(0, limit);
}
