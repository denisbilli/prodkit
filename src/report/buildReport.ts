import type { ProjectAnalysis } from '../analyzer/types';
import { runRules } from '../rules/ruleEngine';
import { computeMaturity, computeScore } from './score';
import { CATEGORIES } from './types';
import type { Category, ExpectationMode, Finding, ProductionReadinessReport } from './types';
import { evaluateExpectedCapabilities } from '../expectations/evaluateExpectations';
import { inferProductProfile } from '../expectations/inferProductProfile';
import type { DeclaredIntent, ProductExpectationResult, ProductProfile } from '../expectations/types';
import { PRODKit_VERSION } from '../version';
import { buildCategoryScores } from './categoryScores';
import { withBusinessImpact } from './businessImpact';
import { withEvidenceDigest } from './evidenceDigest';
import { buildComplianceMapping } from './complianceMapping';
import { buildExecutiveSummary } from './executiveSummary';
import { getRemediationEntry } from '../planner/remediationCatalog';

export interface BuildReportOptions {
  profile?: ProductProfile;
  /**
   * What the owner says the product does.
   *
   * Only ever raises an expectation. The cloud application collects these four answers
   * when a project is created, displayed them as "Product intent", and never passed
   * them here — so the same report could say "file uploads: No" and raise a critical
   * about file uploads.
   */
  declared?: DeclaredIntent;
}

// Derived from the union in report/types.ts, so a new category cannot be missed here.

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
          inferredProfile: inferred.inferredProfile ?? undefined,
          profileSuggestion: inferred.suggestion,
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
          inferredProfile: inferred.inferredProfile ?? undefined,
          inferenceConfidence: inferred.confidence,
          declared: options?.declared,
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
        declared: options?.declared,
      });
      productProfile = evaluated.result;
      expectationFindings = evaluated.findings;
      expectationScore = evaluated.result.score;
    }
  }

  const findings = withEvidenceDigest(withBusinessImpact(
    [...observedFindings, ...expectationFindings].sort((a, b) => bySeverityPriority(a) - bySeverityPriority(b)),
  ));
  const combinedScore = expectationScore === undefined
    ? observedScore
    : Math.max(0, Math.min(100, Math.round((observedScore * 0.6) + (expectationScore * 0.4))));

  // A recognised mobile platform counts as a stack signal. Without this an Android
  // project with an AndroidManifest.xml and a build.gradle was reported as
  // "inconclusive — no package manifests found", which is the analyzer saying it
  // understood nothing about a project it had in fact identified, and capping the score
  // at 39 on that basis.
  const mobileDetected = analysis.detectors['mobile.platform']?.present === true;

  // A game engine says what the project is built on exactly as a mobile platform does,
  // and for the same reason must count. A Unity game and a Phaser game were each
  // identified as games by name and then called unreadable in the same report.
  const gameEngineDetected = analysis.detectors['game.engine']?.present === true;

  const stackDetected = analysis.stack.frontend.length > 0
    || analysis.stack.backend.length > 0
    || analysis.stack.databases.length > 0
    || mobileDetected
    || gameEngineDetected;
  const inconclusive = !stackDetected && analysis.workspaceStacks.length === 0;
  const inconclusiveReasons: string[] = [];
  if (inconclusive) {
    inconclusiveReasons.push('No frontend, backend, or database stack signals were detected.');
    inconclusiveReasons.push('No package manifest was found in any format this analyzer reads.');
    if (analysis.files.source.length === 0) {
      inconclusiveReasons.push('No recognizable source files were found.');
    }
  }

  // An unrecognized project has almost no applicable detectors, so the absence
  // of findings must not be rewarded with a high score: cap it at prototype.
  const overallScore = inconclusive ? Math.min(combinedScore, 39) : combinedScore;
  /**
   * Coverage counts the expectations too, not only the observed rules.
   *
   * A satisfied expectation never becomes a finding — only gaps do — so a report that
   * verified five required capabilities was counting none of them. The first repository
   * to show it was a library: every packaging capability present, and a coverage line
   * that said nothing had been verified.
   */
  const satisfiedExpectations = productProfile?.gap.satisfied ?? 0;
  const applicableExpectations = productProfile?.gap.applicableTotal ?? 0;

  const passedChecksForMaturity = findings.filter((f) => f.status === 'passed').length + satisfiedExpectations;
  const assessedChecks = findings.filter((f) => f.status !== 'unknown').length
    + Math.max(applicableExpectations - expectationFindings.length, 0);
  const maturityLevel = computeMaturity(overallScore, {
    passed: passedChecksForMaturity,
    assessed: assessedChecks,
  });

  const findingsByCategory = Object.fromEntries(CATEGORIES.map((c) => [c, [] as Finding[]])) as Record<Category, Finding[]>;
  for (const f of findings) findingsByCategory[f.category].push(f);

  const criticalIssues = findings.filter((f) => f.severity === 'critical' && f.status !== 'passed' && f.status !== 'unknown');
  const warnings = findings.filter((f) => ['high', 'medium', 'low'].includes(f.severity) && f.status !== 'passed' && f.status !== 'unknown');
  const passedChecks = findings.filter((f) => f.status === 'passed');

  /**
   * A list of actions, with nothing in it that is the sum of the others.
   *
   * The report listed "Consent capture", "Data export", "Data erasure" and "Retention
   * limits", and then "Privacy compliance signals: implement consent, export/erasure
   * workflows, and retention policies" — the same work restated as one vaguer sentence.
   * A reader following the list does the work and then meets a step telling them to do
   * it, which is how a list of actions stops being read as one.
   *
   * The catalogue says which general tasks are superseded and by what, so the
   * relationship is written down rather than inferred from wording.
   */
  const openFindingIds = new Set(
    findings.filter((f) => f.status !== 'passed' && f.status !== 'unknown').map((f) => f.id),
  );

  const seenTasks = new Set<string>();

  const suggestedNextSteps = findings
    .filter((f) => f.status !== 'passed' && f.status !== 'unknown')
    .filter((f) => {
      const entry = getRemediationEntry(f.id);
      if (entry?.supersededBy?.some((capabilityFindingId) => openFindingIds.has(capabilityFindingId))) return false;

      // One step per job. "Health endpoint: add a /health or /healthz endpoint" and
      // "Healthcheck endpoint: add /health or /healthz endpoint for runtime and
      // deployment checks" are one instruction written twice; the catalogue says so by
      // giving both findings the same task id.
      if (!entry) return true;
      if (seenTasks.has(entry.taskId)) return false;

      seenTasks.add(entry.taskId);
      return true;
    })
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
    // The denominator the score was missing. A reader comparing two reports is entitled
    // to know that one rests on seventeen verdicts and the other on nine.
    assessedChecks,
    verifiedChecks: passedChecksForMaturity,
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
