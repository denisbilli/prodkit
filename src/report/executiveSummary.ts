import type { CategoryScore } from './categoryScores';
import { weakestCategories } from './categoryScores';
import type { Category, Finding, MaturityLevel } from './types';
import type { ProductExpectationResult } from '../expectations/types';

export interface ExecutiveSummary {
  /** One sentence a non-technical reader can act on. */
  verdict: string;
  /** Whether the product can plausibly be launched as the selected profile. */
  launchReady: boolean;
  /** The blocking themes, in plain language, worst first. */
  topRisks: string[];
  /** What the repository already does well, so the report is not only negative. */
  strengths: string[];
  /** Rough calendar estimate to close the required gaps. */
  estimatedEffort: string;
  /** Plain-language restatement of what the score means. */
  scoreExplanation: string;
}

/**
 * Plain-language names for categories. The report is read by founders deciding
 * whether to launch, not only by the engineer who will do the work, so the summary
 * avoids the vocabulary used in the findings themselves.
 */
const CATEGORY_LABEL: Record<Category, string> = {
  meta: 'project metadata',
  stack: 'technology stack',
  env: 'configuration and secrets',
  auth: 'signing in',
  authz: 'permissions',
  tenancy: 'separating one customer from another',
  gdpr: 'privacy and GDPR duties',
  security: 'basic web security',
  uploads: 'file uploads',
  billing: 'taking payments',
  audit: 'traceability of sensitive actions',
  observability: 'knowing what happens in production',
  client: 'saving work and loading the app',
  jobs: 'background processing',
  deployment: 'deploying repeatably',
};

const MATURITY_LABEL: Record<MaturityLevel, string> = {
  prototype: 'a prototype',
  early: 'an early build',
  partial: 'partly ready',
  production_ready: 'production ready',
};

/**
 * Weeks of work per missing capability, by importance.
 *
 * Deliberately coarse. The estimate exists to turn "13 things are missing" into a
 * decision about calendar time, and a range communicates the uncertainty better than
 * a precise number that would be wrong anyway.
 */
const WEEKS_PER_REQUIRED = 0.8;
const WEEKS_PER_RECOMMENDED = 0.3;

function estimateEffort(profile: ProductExpectationResult | undefined): string {
  if (!profile) return 'Not estimated without a product profile.';

  const { gap } = profile;
  const weeks =
    (gap.requiredMissing + gap.requiredPartial * 0.5) * WEEKS_PER_REQUIRED +
    (gap.recommendedMissing + gap.recommendedPartial * 0.5) * WEEKS_PER_RECOMMENDED;

  if (weeks < 0.5) return 'Under a week of focused work.';
  if (weeks < 2) return 'Roughly one to two weeks of focused work.';

  const low = Math.floor(weeks);
  const high = Math.ceil(weeks * 1.6);
  return `Roughly ${low} to ${high} weeks of focused work for one developer.`;
}

function buildVerdict(args: {
  profile: ProductExpectationResult | undefined;
  maturity: MaturityLevel;
  inconclusive: boolean;
}): { verdict: string; launchReady: boolean } {
  if (args.inconclusive) {
    return {
      verdict: 'ProdKit could not recognise this project well enough to judge it. Check that the path points at application source.',
      launchReady: false,
    };
  }

  if (!args.profile) {
    return {
      verdict: `Judged on its code alone, this project looks like ${MATURITY_LABEL[args.maturity]}. Choose a product profile to see what it would still need to launch.`,
      launchReady: args.maturity === 'production_ready',
    };
  }

  const { gap, profileTitle } = args.profile;
  const launchReady = gap.requiredMissing === 0 && gap.requiredPartial === 0;

  if (launchReady) {
    return {
      verdict: `This project covers everything expected of ${profileTitle}. What remains is refinement, not blockers.`,
      launchReady: true,
    };
  }

  const blocking = gap.requiredMissing + gap.requiredPartial;
  return {
    verdict: `This project is not ready to launch as ${profileTitle}: ${blocking} essential ${blocking === 1 ? 'capability is' : 'capabilities are'} missing or incomplete.`,
    launchReady: false,
  };
}

function buildStrengths(categoryScores: CategoryScore[], findings: Finding[]): string[] {
  const passed = findings.filter((finding) => finding.status === 'passed');

  const strongCategories = categoryScores
    .filter((entry) => !entry.notAssessed && entry.score >= 80 && entry.findingCount === 0)
    .map((entry) => CATEGORY_LABEL[entry.category]);

  const strengths = strongCategories.slice(0, 3).map((label) => `no issues found in ${label}`);

  if (strengths.length === 0 && passed.length > 0) {
    strengths.push(`${passed.length} individual ${passed.length === 1 ? 'check' : 'checks'} already pass`);
  }

  return strengths;
}

export function buildExecutiveSummary(args: {
  findings: Finding[];
  categoryScores: CategoryScore[];
  profile: ProductExpectationResult | undefined;
  maturity: MaturityLevel;
  observedScore: number;
  overallScore: number;
  inconclusive: boolean;
}): ExecutiveSummary {
  const { verdict, launchReady } = buildVerdict({
    profile: args.profile,
    maturity: args.maturity,
    inconclusive: args.inconclusive,
  });

  const topRisks = weakestCategories(args.categoryScores).map((entry) => {
    const label = CATEGORY_LABEL[entry.category];
    if (entry.criticalCount > 0) {
      return `${label}: ${entry.criticalCount} critical ${entry.criticalCount === 1 ? 'issue' : 'issues'} to resolve before launch`;
    }
    return `${label}: ${entry.findingCount} ${entry.findingCount === 1 ? 'issue' : 'issues'} to address`;
  });

  const scoreExplanation = args.profile
    ? `${args.observedScore} of 100 on what the code does today, ${args.overallScore} of 100 once measured against what ${args.profile.profileTitle} normally requires.`
    : `${args.observedScore} of 100 on what the code does today, with no product expectations applied.`;

  return {
    verdict,
    launchReady,
    topRisks,
    strengths: buildStrengths(args.categoryScores, args.findings),
    estimatedEffort: estimateEffort(args.profile),
    scoreExplanation,
  };
}
