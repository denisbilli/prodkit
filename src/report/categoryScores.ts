import type { Category, Finding, Severity } from './types';

export interface CategoryScore {
  category: Category;
  /** 0-100. 100 means nothing actionable was found in this category. */
  score: number;
  findingCount: number;
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

    const penalty = actionable.reduce((total, finding) => total + SEVERITY_WEIGHT[finding.severity], 0);

    return {
      category,
      score: Math.max(0, Math.min(100, 100 - penalty)),
      findingCount: actionable.length,
      criticalCount: actionable.filter((finding) => finding.severity === 'critical').length,
      highCount: actionable.filter((finding) => finding.severity === 'high').length,
      notAssessed: categoryFindings.length === 0,
    };
  });
}

/** The categories dragging the report down most, worst first. */
export function weakestCategories(scores: CategoryScore[], limit = 3): CategoryScore[] {
  return [...scores]
    .filter((entry) => !entry.notAssessed && entry.findingCount > 0)
    .sort((left, right) => left.score - right.score || right.criticalCount - left.criticalCount)
    .slice(0, limit);
}
