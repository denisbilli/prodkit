import type { DetectorEvidence, StackInfo } from '../analyzer/types';
import type { ProductExpectationResult, ProductProfile } from '../expectations/types';
import type { CategoryScore } from './categoryScores';
import type { ComplianceObligation } from './complianceMapping';
import type { ExecutiveSummary } from './executiveSummary';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type FindingStatus = 'passed' | 'missing' | 'partial' | 'unknown';
export type FindingConfidence = 'low' | 'medium' | 'high';
export type EvidenceQuality = 'weak' | 'medium' | 'strong';

/**
 * The canonical list, with the type derived from it rather than written twice.
 *
 * buildReport builds a findings-by-category map by iterating an array, and that array
 * used to be a second hand-written copy of this union. Adding `game` to the union
 * compiled cleanly and then crashed at run time on `findingsByCategory[f.category].push`,
 * because the array had never heard of it. Deriving one from the other makes that
 * impossible rather than merely unlikely.
 */
export const CATEGORIES = [
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
  'client',
  'mobile',
  'jobs',
  'deployment',
  // What a package is judged on, as opposed to a running service: whether it can be
  // installed, whether anything proves it works, whether anyone wrote down what it is.
  'packaging',
  'quality',
  'docs',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  /**
   * How much this check is worth, whichever way it came out.
   *
   * `severity` becomes `info` the moment a check passes, so a category that verified a
   * critical control and failed three lesser ones had no way to say the critical one is
   * fine: the passing check simply weighed nothing. A real PHP product read 0/100 for
   * security on three findings, none of them critical, with a passing check right there
   * in the same category.
   */
  stakes: Severity;
  category: Category;
  status: FindingStatus;
  description: string;
  evidence: DetectorEvidence[];
  recommendation: string;
  confidence: FindingConfidence;
  evidenceQuality: EvidenceQuality;
  /**
   * What actually happens if this is left as it is, in plain language.
   * Present on actionable findings; absent on passed checks.
   */
  businessImpact?: string;
}

/**
 * `inconclusive` is a band of its own, not the bottom of the scale.
 *
 * A repository this analyzer could not read is not a prototype. It used to be called
 * one, with a score of 39 beside it — the cap applied so that absence of findings
 * could not be rewarded — and eleven repositories in the corpus came out at exactly
 * 39: a wake-word engine, a database manager, an Advent of Code repository. One of
 * them had no findings at all. The number was not measuring them; it was the cap.
 */
export type MaturityLevel = 'inconclusive' | 'prototype' | 'early' | 'partial' | 'production_ready';

export type ExpectationMode = 'observed-only' | 'explicit-profile' | 'auto-applied' | 'auto-inconclusive';

import type { LanguageReading } from '../analyzer/readingDepth';

export interface ReportDiagnostics {
  analyzedFileCount: number;
  skippedFileCount: number;
  workspaceCount: number;
  detectorCount: number;
  /** Checks that reached a verdict, rather than being left unknown. */
  assessedChecks: number;
  /** Of those, the ones that ran and found what they were looking for. */
  verifiedChecks: number;
  /**
   * How closely each language present was read.
   *
   * A finding matched from a keyword in Go and a finding read from a syntax tree in
   * TypeScript were presented with identical confidence. They are not the same kind of
   * fact, and the reader is entitled to know which one they have.
   */
  readingDepth: LanguageReading[];
  /**
   * Whether a route name was ever read in this project, where it authenticates.
   *
   * Four capabilities — password reset, email verification, personal data export and
   * erasure — are found by the English words their routes are usually given. Where
   * none of `/login`, `/register` or `/signin` ever matched, those searches could not
   * reach this project's vocabulary and answer `unknown` instead of `missing`.
   *
   * Withdrawing the claim silently would be its own failure: the reader of a project
   * whose routes are `/accedi` and `/recupero-password` would see four questions
   * simply absent, with nothing saying why. This is what the report says instead.
   *
   * Optional because this interface is a published type and somebody else builds
   * values of it. Adding a required field to it is a breaking change however small
   * the field is, and 1.26.1 shipped one in a patch release: produtype.dev stopped
   * compiling on the fixture it builds for its own tests. `buildReport` always sets
   * it; the question mark is for everyone who does not.
   */
  routeNamesUnread?: boolean;
  /**
   * Whether the optional TypeScript compiler was loaded for this reading.
   *
   * Two readings with the same `readingDepth` list are not the same reading: JavaScript
   * shows as `searched` only when the compiler was missing, and that is the one a reader
   * can fix.
   */
  parsedStructure: boolean;
  detectors: Array<{
    id: string;
    status: 'completed' | 'skipped';
    reason?: string;
  }>;
  selectedProfile: ProductProfile;
  inferredProfile?: ProductProfile;
  inferenceConfidence?: 'low' | 'medium' | 'high';
  expectationMode: ExpectationMode;
  prodkitVersion: string;
}

export interface ProductionReadinessReport {
  projectPath: string;
  generatedAt: string;
  /** `null` where the reading is inconclusive, for the same reason `overallScore` is. */
  observedScore: number | null;
  expectedCapabilityScore?: number;
  /**
   * `null` where the reading is inconclusive, which is the same rule this product
   * applies everywhere else: a number that was not measured is not reported. The
   * reasons in `inconclusiveReasons` are the answer in its place.
   */
  overallScore: number | null;
  maturityLevel: MaturityLevel;
  inconclusive: boolean;
  inconclusiveReasons: string[];
  productProfile?: ProductExpectationResult;
  detectedStack: StackInfo;
  findings: Finding[];
  findingsByCategory: Record<Category, Finding[]>;
  criticalIssues: Finding[];
  warnings: Finding[];
  /**
   * The observed rules that passed. Not the capabilities a profile asked for and found.
   *
   * Those live in `productProfile.capabilities`, every one of them, with its own
   * status — and they are deliberately not repeated here. A met expectation and the
   * observed rule underneath it are the same verification stated twice: counting both
   * made "basic web security: 4 checks verified" read as 7.
   *
   * Written down because the shape misleads on the way in. Reading `findings` and
   * `passedChecks` and finding no capability in either looks exactly like a capability
   * no project ever satisfies, and it is not: it is the wrong array. That reading was
   * made twice while surveying this analyzer's own corpus.
   */
  passedChecks: Finding[];
  suggestedNextSteps: string[];
  technicalEvidence: Array<{ findingId: string; evidence: DetectorEvidence[] }>;
  /** Plain-language summary for a reader deciding whether to launch, not how to fix. */
  executiveSummary: ExecutiveSummary;
  /** Per-category readiness, so the report can say where the product is weak. */
  categoryScores: CategoryScore[];
  /**
   * Obligations touched by the analysis. Advisory only — ProdKit is not a compliance
   * certification and an obligation nothing maps to is omitted rather than called met.
   */
  compliance: ComplianceObligation[];
  diagnostics: ReportDiagnostics;
}
