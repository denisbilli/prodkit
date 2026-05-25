import type { ProjectAnalysis } from '../analyzer/types';
import { runRules } from '../rules/ruleEngine';
import { computeMaturity, computeScore } from './score';
import type { Category, Finding, ProductionReadinessReport } from './types';
import { evaluateExpectedCapabilities } from '../expectations/evaluateExpectations';
import { inferProductProfile } from '../expectations/inferProductProfile';
import type { ProductExpectationResult, ProductProfile } from '../expectations/types';

export interface BuildReportOptions {
  profile?: ProductProfile;
}

const categories: Category[] = [
  'meta',
  'stack',
  'env',
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
];

function bySeverityPriority(f: Finding): number {
  const order: Record<Finding['severity'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  return order[f.severity];
}

export function buildReport(analysis: ProjectAnalysis, options?: BuildReportOptions): ProductionReadinessReport {
  const observedFindings = runRules(analysis);
  const observedScore = computeScore(observedFindings);
  const requestedProfile = options?.profile ?? 'observed-only';

  let expectationFindings: Finding[] = [];
  let expectationScore: number | undefined;
  let productProfile: ProductExpectationResult | undefined;

  if (requestedProfile !== 'observed-only') {
    if (requestedProfile === 'auto') {
      const inferred = inferProductProfile(analysis);
      if (inferred.confidence === 'low') {
        productProfile = {
          selectedProfile: 'auto',
          inferredProfile: inferred.inferredProfile,
          inferenceConfidence: inferred.confidence,
          profileTitle: 'Auto (inconclusive)',
          profileDescription: 'Profile inference was inconclusive; expected capabilities were not applied.',
          capabilities: [],
          score: observedScore,
          note: inferred.reason,
        };
      } else {
        const evaluated = evaluateExpectedCapabilities({
          analysis,
          selectedProfile: inferred.inferredProfile as Exclude<ProductProfile, 'auto' | 'observed-only'>,
          requestedProfile,
          inferredProfile: inferred.inferredProfile,
          inferenceConfidence: inferred.confidence,
        });
        productProfile = evaluated.result;
        expectationFindings = evaluated.findings;
        expectationScore = evaluated.result.score;
      }
    } else {
      const evaluated = evaluateExpectedCapabilities({
        analysis,
        selectedProfile: requestedProfile as Exclude<ProductProfile, 'auto' | 'observed-only'>,
        requestedProfile,
      });
      productProfile = evaluated.result;
      expectationFindings = evaluated.findings;
      expectationScore = evaluated.result.score;
    }
  }

  const findings = [...observedFindings, ...expectationFindings].sort((a, b) => bySeverityPriority(a) - bySeverityPriority(b));
  const overallScore = expectationScore === undefined
    ? observedScore
    : Math.max(0, Math.min(100, Math.round((observedScore * 0.6) + (expectationScore * 0.4))));
  const maturityLevel = computeMaturity(overallScore);

  const findingsByCategory = Object.fromEntries(categories.map((c) => [c, [] as Finding[]])) as Record<Category, Finding[]>;
  for (const f of findings) findingsByCategory[f.category].push(f);

  const criticalIssues = findings.filter((f) => f.severity === 'critical' && f.status !== 'passed' && f.status !== 'unknown');
  const warnings = findings.filter((f) => ['high', 'medium', 'low'].includes(f.severity) && f.status !== 'passed' && f.status !== 'unknown');
  const passedChecks = findings.filter((f) => f.status === 'passed');

  const suggestedNextSteps = findings
    .filter((f) => f.status !== 'passed' && f.status !== 'unknown')
    .slice(0, 10)
    .map((f) => `${f.title}: ${f.recommendation}`);

  const technicalEvidence = findings.map((f) => ({ findingId: f.id, evidence: f.evidence }));

  return {
    projectPath: analysis.projectPath,
    generatedAt: new Date().toISOString(),
    observedScore,
    expectedCapabilityScore: expectationScore,
    overallScore,
    maturityLevel,
    productProfile,
    detectedStack: analysis.stack,
    findings,
    findingsByCategory,
    criticalIssues,
    warnings,
    passedChecks,
    suggestedNextSteps,
    technicalEvidence,
  };
}
