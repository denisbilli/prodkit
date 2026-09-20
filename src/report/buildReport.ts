import type { ProjectAnalysis } from '../analyzer/types';
import { runRules } from '../rules/ruleEngine';
import { readingDepths } from '../analyzer/readingDepth';
import {
  computeMaturity,
  computeScore,
  mayClaimTopBand,
  MIN_ASSESSED_FOR_A_READING,
  TOP_BAND_CEILING,
} from './score';
import { CATEGORIES } from './types';
import type { Category, ExpectationMode, Finding, MaturityLevel, ProductionReadinessReport } from './types';
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
import { DOCS_DIRECTORIES } from '../analyzer/detectPackaging';

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


/**
 * A finding whose every citation is in the documentation site or a playground.
 *
 * Medusa was told its CORS policy was open, evidenced from `www/apps/cloud/`, and that
 * its Stripe webhook handling was unverified, evidenced from the documentation's
 * `sidebar.mjs` — the navigation menu that lists a page about webhooks. Vite keeps ten
 * Express servers under `playground/` for the same kind of reason.
 *
 * These are not false matches: the lines are there. They are matches about something
 * other than the product, and a report that cannot tell the two apart tells its reader
 * to go and fix a documentation site.
 *
 * Only where the repository has source outside those directories. A documentation site
 * that *is* the product keeps every finding it earns.
 */
function onlyEvidencedInDocumentation(finding: Finding, hasProductSource: boolean): boolean {
  if (!hasProductSource) return false;

  const cited = finding.evidence.filter((item) => item.file);
  return cited.length > 0 && cited.every((item) => DOCS_DIRECTORIES.test(item.file as string));
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

  /**
   * Whether this repository is more than its documentation.
   *
   * If every source file lives under `docs/` or `website/`, the documentation is the
   * product and its findings are the product's.
   */
  const hasProductSource = analysis.files.source.some((file) => !DOCS_DIRECTORIES.test(file));

  const findings = withEvidenceDigest(withBusinessImpact(
    [...observedFindings, ...expectationFindings]
      .map((finding) =>
        onlyEvidencedInDocumentation(finding, hasProductSource)
          ? {
              ...finding,
              status: 'unknown' as const,
              severity: 'info' as const,
              description: `${finding.description} Every line behind this is in the documentation site or a playground rather than in the product, so nothing here says the product does it.`,
            }
          : finding,
      )
      .sort((a, b) => bySeverityPriority(a) - bySeverityPriority(b)),
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
  const coverage = { passed: passedChecksForMaturity, assessed: assessedChecks };

  const nothingIdentified = !stackDetected && analysis.workspaceStacks.length === 0;

  /**
   * Too little reached a verdict to say anything about this project.
   *
   * The flag used to ask whether a manifest existed, and the claim it makes is about
   * what was learned. Two repositories with the same three verdicts came out at 39 and
   * at 84, and the only difference between them was a `requirements.txt`: a Python
   * script with one was judged, an equally small one without it was called unreadable.
   *
   * Five is where the corpus splits. Of seventy-eight repositories, eleven reach four
   * verdicts or fewer and thirty reach ten or more; not one lands in between. Four
   * verdicts cannot characterise a product, however many files it has.
   */
  /**
   * Only where the analysis was asked for a full reading.
   *
   * In observed-only mode nothing but the rules runs, and a small project reaches three
   * or four verdicts because the expectations that would produce the rest were never
   * requested — not because it is unreadable. The command-line tool defaults to that
   * mode, and this rule, written against the profile path, turned twenty-three of its
   * reports into "project not recognized": a Flutter application, a Vue application, a
   * .NET game, each of them named on the line above by the same summary.
   *
   * Found by running the tool the way somebody who installed it would, rather than by
   * calling the API the way the tests do.
   */
  const tooLittleAssessed = requestedProfile !== 'observed-only'
    && assessedChecks < MIN_ASSESSED_FOR_A_READING;

  /**
   * The report reads its own warning.
   *
   * Plausible is a Phoenix application: 1257 Elixir files and 215 of JavaScript around
   * them. The analyzer said so — "1257 Elixir files were not analysed: this reading
   * covers only part of the repository" — and in the same report called it a client
   * application, with high confidence, scored 85 and not inconclusive. A warning printed
   * beside a verdict that ignores it is not a warning.
   *
   * The test is which part is bigger. Where the languages nothing here can read
   * outnumber the files it did read, the reading rests on a minority of the repository
   * and cannot characterise it — whatever those remaining files happen to look like. A
   * game with a handful of C++ files beside its TypeScript is unaffected, which is the
   * shape this must not break: not one of the seventy-eight repositories on the machine
   * this was written on crosses the line, and the first public repository that did was
   * the sixth one tried.
   */
  const unreadableFiles = analysis.files.unreadable.reduce((total, entry) => total + entry.files, 0);
  const mostlyUnreadable = unreadableFiles > analysis.files.source.length;
  const inconclusive = nothingIdentified || tooLittleAssessed || mostlyUnreadable;

  // Each reason says which of the two it was, because they call for different things:
  // one is a repository this analyzer cannot read, the other is one there is barely
  // anything to read.
  const inconclusiveReasons: string[] = [];
  if (nothingIdentified) {
    inconclusiveReasons.push('No frontend, backend, or database stack signals were detected.');
    inconclusiveReasons.push('No package manifest was found in any format this analyzer reads.');
    if (analysis.files.source.length === 0) {
      inconclusiveReasons.push('No recognizable source files were found.');
    }
  }
  if (mostlyUnreadable) {
    const [largest] = [...analysis.files.unreadable].sort((left, right) => right.files - left.files);
    inconclusiveReasons.push(
      `Most of this repository is written in ${largest.language}, which this analyzer does not read: ${unreadableFiles} of its files were skipped and ${analysis.files.source.length} were read.`,
    );
  }
  if (tooLittleAssessed) {
    inconclusiveReasons.push(
      `Only ${assessedChecks} check${assessedChecks === 1 ? '' : 's'} reached a verdict, which is too few to characterise this project.`,
    );
  }

  /**
   * An inconclusive reading has no score.
   *
   * This was a cap at 39, so that an unrecognised project could not be rewarded for
   * the absence of findings. The intent was right and the output was not: eleven
   * repositories in the corpus came out at exactly 39, and one of them — a Python
   * transcription script — had no findings at all. A reader saw "39/100, prototype"
   * about a repository whose own report said it could not be read.
   *
   * `null` is the rule this product applies everywhere else. The reasons already
   * collected above are the answer in its place.
   */
  const scoreAfterInconclusive = combinedScore;

  /**
   * The number obeys the same rule as the label.
   *
   * The score starts at 100 and only ever subtracts, so a repository small enough that
   * almost nothing applies to it keeps most of what it was handed. The maturity label
   * has refused to call that production ready since the coverage rule was added — and
   * the number beside it went on saying 98, above every real product in the verification
   * corpus. A Python transcription script rested on three passing checks out of four and
   * outscored this product's own web application, which rests on thirty.
   *
   * Nothing is subtracted for thin coverage, because there is nothing to subtract for:
   * the report simply may not enter the top band on evidence that cannot support it.
   */
  /**
   * An unresolved critical bars the top band too.
   *
   * Counted before the score is capped, because it is one of the two reasons the top
   * band can be refused and both must reach the number, not only the label.
   */
  const openCriticals = findings.filter(
    (f) => f.severity === 'critical' && f.status !== 'passed' && f.status !== 'unknown',
  ).length;

  const overallScore = inconclusive
    ? null
    : mayClaimTopBand(coverage, openCriticals)
      ? scoreAfterInconclusive
      : Math.min(scoreAfterInconclusive, TOP_BAND_CEILING);

  const maturityLevel: MaturityLevel = overallScore === null
    ? 'inconclusive'
    : computeMaturity(overallScore, coverage, openCriticals);

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
    inconclusiveReasons,
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
    /**
     * How closely each language was read, so a reader can weigh a finding by more than
     * its severity. A keyword match in Go and a parsed guard in TypeScript were being
     * presented with the same confidence.
     */
    readingDepth: readingDepths(analysis.files.source, analysis.files.unreadable),
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
