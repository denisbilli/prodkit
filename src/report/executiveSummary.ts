import type { CategoryScore } from './categoryScores';
import { weakestCategories } from './categoryScores';
import type { Category, Finding, MaturityLevel } from './types';
import type { ProductExpectationResult } from '../expectations/types';
import { getRemediationEntry } from '../planner/remediationCatalog';
import type { RemediationCatalogEntry } from '../planner/types';

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
  mobile: 'running on somebody else\u2019s phone',
  jobs: 'background processing',
  deployment: 'deploying repeatably',
  packaging: 'being installable by somebody else',
  quality: 'evidence that it works',
  docs: 'saying what this is',
};

const MATURITY_LABEL: Record<MaturityLevel, string> = {
  inconclusive: 'not characterised, because too little of it could be read',
  prototype: 'a prototype',
  early: 'an early build',
  partial: 'partly ready',
  production_ready: 'production ready',
};

/**
 * Days of work per task, from how the remediation catalogue itself classifies it.
 *
 * The estimate used to multiply a flat 0.8 weeks by the number of missing required
 * capabilities and widen the result by 1.6, which said "roughly 8 to 14 weeks" about a
 * real project where one to two was honest — and an independent review said so. Four
 * days is not what a rate limit costs, nor a CSP header, and it is nowhere near what
 * GDPR erasure costs; averaging them made every number wrong in a different direction.
 *
 * The catalogue already carries a per-task judgement that somebody made deliberately.
 * Using it is both more honest and cheaper than inventing a second opinion here.
 */
const DAYS_PER_EFFORT: Record<RemediationCatalogEntry['effort'], number> = {
  small: 0.5,
  medium: 2,
  large: 5,
};

/**
 * For a finding the catalogue has no task for.
 *
 * Silence is not zero work, and dropping these would understate the total in exactly
 * the direction that makes a report comfortable to read.
 */
const DAYS_BY_SEVERITY: Record<Finding['severity'], number> = {
  critical: 2,
  high: 2,
  medium: 1,
  low: 0.5,
  info: 0,
};

function estimateEffort(findings: Finding[], profile: ProductExpectationResult | undefined): string {
  if (!profile) return 'Not estimated without a product profile.';

  const open = findings.filter((f) => f.status !== 'passed' && f.status !== 'unknown');
  if (open.length === 0) return 'Nothing outstanding to estimate.';

  /**
   * One cost per job, not per finding.
   *
   * An observed rule and the expectation for the same subject are two views of one
   * claim, and the remediation catalogue says so by giving them the same task id — it
   * is how the plan produces one task rather than two. The estimate was billing both:
   * on a real project `observability.health` and
   * `expectation.observability.health.required` were charged separately, and so were
   * the two halves of deployment readiness. The estimate is of the work, and the work
   * is the plan.
   */
  const byTask = new Map<string, number>();
  for (const finding of open) {
    const entry = getRemediationEntry(finding.id);
    const key = entry?.taskId ?? finding.id;
    const cost = entry ? DAYS_PER_EFFORT[entry.effort] : DAYS_BY_SEVERITY[finding.severity];
    // A partial implementation is work already begun, not work not begun. Where two
    // findings share a task, the more complete reading of it is the one that stands.
    const forThis = finding.status === 'partial' ? cost * 0.5 : cost;

    byTask.set(key, Math.max(byTask.get(key) ?? 0, forThis));
  }

  const days = [...byTask.values()].reduce((total, cost) => total + cost, 0);

  if (days < 1) return 'Under a day of focused work.';
  if (days <= 4) return `Roughly ${Math.round(days)} ${Math.round(days) === 1 ? 'day' : 'days'} of focused work.`;

  const weeks = days / 5;
  if (weeks < 2) return 'Roughly one to two weeks of focused work.';

  /**
   * A range, because summing per-task estimates is still an estimate. The upper bound
   * is half again rather than the 1.6 it was: a wider band on an invented number only
   * made the invention harder to argue with.
   */
  return `Roughly ${Math.floor(weeks)} to ${Math.ceil(weeks * 1.5)} weeks of focused work for one developer.`;
}

function buildVerdict(args: {
  profile: ProductExpectationResult | undefined;
  maturity: MaturityLevel;
  inconclusive: boolean;
  inconclusiveReasons: string[];
}): { verdict: string; launchReady: boolean } {
  if (args.inconclusive) {
    /**
     * The reason, where there is one worth giving.
     *
     * "Check that the path points at application source" is right for a directory with
     * nothing in it and wrong for a Phoenix application: the path was fine, the language
     * is one this analyzer does not read, and telling its author to check their path
     * sends them looking for a mistake they did not make.
     */
    const [reason] = args.inconclusiveReasons;

    return {
      verdict: reason
        ? `ProdKit could not judge this project. ${reason}`
        : 'ProdKit could not recognise this project well enough to judge it. Check that the path points at application source.',
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

  /**
   * A strength is something verified, not something absent.
   *
   * Filtering on "assessed, scoring well, nothing open" let a category qualify on the
   * strength of having nothing to say about it. Requiring a passed check means the
   * report only calls something a strength when it watched it work.
   */
  const passedCategories = new Set(passed.map((finding) => finding.category));

  const strongCategories = categoryScores
    .filter(
      (entry) =>
        !entry.notAssessed
        && (entry.score ?? 0) >= 80
        && entry.findingCount === 0
        && passedCategories.has(entry.category),
    );

  /**
   * "What already works" should describe work, not an absence.
   *
   * It read "no issues found in configuration and secrets", which is the same sentence
   * a report would print if it had not looked — and the reader of a paid report cannot
   * tell those apart. The counts are known now, so the section can say what was checked
   * and found right.
   */
  const strengths = strongCategories.slice(0, 3).map((entry) => {
    const label = CATEGORY_LABEL[entry.category];
    const checks = entry.verifiedCount === 1 ? '1 check' : `${entry.verifiedCount} checks`;

    return `${label}: ${checks} verified, nothing outstanding`;
  });

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
  observedScore: number | null;
  overallScore: number | null;
  inconclusive: boolean;
  /** Why, when the report could not form a reading. Named in the verdict. */
  inconclusiveReasons?: string[];
}): ExecutiveSummary {
  const { verdict, launchReady } = buildVerdict({
    profile: args.profile,
    maturity: args.maturity,
    inconclusive: args.inconclusive,
    inconclusiveReasons: args.inconclusiveReasons ?? [],
  });

  const topRisks = weakestCategories(args.categoryScores).map((entry) => {
    const label = CATEGORY_LABEL[entry.category];
    if (entry.criticalCount > 0) {
      return `${label}: ${entry.criticalCount} critical ${entry.criticalCount === 1 ? 'issue' : 'issues'} to resolve before launch`;
    }
    return `${label}: ${entry.findingCount} ${entry.findingCount === 1 ? 'issue' : 'issues'} to address`;
  });

  const scoreExplanation = args.overallScore === null
    ? `Not scored. ${args.inconclusiveReasons?.[0] ?? 'Too little of this repository could be read to characterise it.'}`
    : args.profile
      ? `${args.observedScore} of 100 on what the code does today, ${args.overallScore} of 100 once measured against what ${args.profile.profileTitle} normally requires.`
      : `${args.observedScore} of 100 on what the code does today, with no product expectations applied.`;

  return {
    verdict,
    launchReady,
    topRisks,
    strengths: buildStrengths(args.categoryScores, args.findings),
    estimatedEffort: estimateEffort(args.findings, args.profile),
    scoreExplanation,
  };
}
