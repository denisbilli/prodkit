import type { ProjectAnalysis } from '../analyzer/types';
import { runRules } from '../rules/ruleEngine';
import { computeMaturity, computeScore } from './score';
import type { Category, ExpectationMode, Finding, ProductionReadinessReport } from './types';
import { evaluateExpectedCapabilities } from '../expectations/evaluateExpectations';
import { inferProductProfile } from '../expectations/inferProductProfile';
import type { ProductExpectationResult, ProductProfile } from '../expectations/types';
import { PRODKit_VERSION } from '../version';
import { buildCategoryScores } from './categoryScores';
import { withBusinessImpact } from './businessImpact';
import { buildComplianceMapping } from './complianceMapping';
import { buildExecutiveSummary } from './executiveSummary';

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

function detectorDiagnostics(analysis: ProjectAnalysis): ProductionReadinessReport['diagnostics']['detectors'] {
  const completed = Object.keys(analysis.detectors).map((id) => ({ id, status: 'completed' as const }));
  const skipped: Array<{ id: string; status: 'skipped'; reason?: string }> = [];

  if (analysis.stack.frontend.length === 0) {
    skipped.push({ id: 'frontend.detectors', status: 'skipped', reason: 'No frontend stack detected.' });
  }

  if (analysis.stack.backend.length === 0) {
    skipped.push({ id: 'backend.detectors', status: 'skipped', reason: 'No backend stack detected.' });
  }

  if (analysis.stack.databases.length === 0) {
    skipped.push({ id: 'database.detectors', status: 'skipped', reason: 'No database stack detected.' });
  }

  return [...completed, ...skipped];
}

function determineExpectationMode(
  requestedProfile: ProductProfile,
  productProfile: ProductExpectationResult | undefined,
  expectationScore: number | undefined,
): ExpectationMode {
  if (requestedProfile === 'observed-only') {
    return 'observed-only';
  }

  if (requestedProfile === 'auto') {
    return expectationScore === undefined || productProfile?.inferenceConfidence === 'low'
      ? 'auto-inconclusive'
      : 'auto-applied';
  }

  return 'explicit-profile';
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
          gap: {
            applicableTotal: 0,
            satisfied: 0,
            requiredTotal: 0,
            requiredMissing: 0,
            requiredPartial: 0,
            recommendedTotal: 0,
            recommendedMissing: 0,
            recommendedPartial: 0,
          },
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

  const findings = withBusinessImpact(
    [...observedFindings, ...expectationFindings].sort((a, b) => bySeverityPriority(a) - bySeverityPriority(b)),
  );
  const combinedScore = expectationScore === undefined
    ? observedScore
    : Math.max(0, Math.min(100, Math.round((observedScore * 0.6) + (expectationScore * 0.4))));

  const stackDetected = analysis.stack.frontend.length > 0
    || analysis.stack.backend.length > 0
    || analysis.stack.databases.length > 0;
  const inconclusive = !stackDetected && analysis.workspaceStacks.length === 0;
  const inconclusiveReasons: string[] = [];
  if (inconclusive) {
    inconclusiveReasons.push('No frontend, backend, or database stack signals were detected.');
    inconclusiveReasons.push('No package manifests (package.json, requirements.txt, pyproject.toml) were found.');
    if (analysis.files.source.length === 0) {
      inconclusiveReasons.push('No recognizable source files were found.');
    }
  }

  // An unrecognized project has almost no applicable detectors, so the absence
  // of findings must not be rewarded with a high score: cap it at prototype.
  const overallScore = inconclusive ? Math.min(combinedScore, 39) : combinedScore;
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
  const categoryScores = buildCategoryScores(findings);
  const compliance = buildComplianceMapping(findings);
  const executiveSummary = buildExecutiveSummary({
    findings,
    categoryScores,
    profile: productProfile,
    maturity: maturityLevel,
    observedScore,
    overallScore,
    inconclusive,
  });
  const expectationMode = determineExpectationMode(requestedProfile, productProfile, expectationScore);
  const diagnostics = {
    analyzedFileCount: analysis.files.source.length,
    skippedFileCount: Math.max(analysis.files.all.length - analysis.files.source.length, 0),
    workspaceCount: Math.max(analysis.workspaceStacks.length, 1),
    detectorCount: Object.keys(analysis.detectors).length,
    detectors: detectorDiagnostics(analysis),
    selectedProfile: requestedProfile,
    inferredProfile: productProfile?.inferredProfile,
    inferenceConfidence: productProfile?.inferenceConfidence,
    expectationMode,
    prodkitVersion: PRODKit_VERSION,
  };

  return {
    projectPath: analysis.projectPath,
    generatedAt: new Date().toISOString(),
    observedScore,
    expectedCapabilityScore: expectationScore,
    overallScore,
    maturityLevel,
    inconclusive,
    inconclusiveReasons,
    productProfile,
    detectedStack: analysis.stack,
    findings,
    findingsByCategory,
    criticalIssues,
    warnings,
    passedChecks,
    suggestedNextSteps,
    technicalEvidence,
    executiveSummary,
    categoryScores,
    compliance,
    diagnostics,
  };
}
