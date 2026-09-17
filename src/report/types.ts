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
  'game',
  'jobs',
  'deployment',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
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

export type MaturityLevel = 'prototype' | 'early' | 'partial' | 'production_ready';

export type ExpectationMode = 'observed-only' | 'explicit-profile' | 'auto-applied' | 'auto-inconclusive';

export interface ReportDiagnostics {
  analyzedFileCount: number;
  skippedFileCount: number;
  workspaceCount: number;
  detectorCount: number;
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
  observedScore: number;
  expectedCapabilityScore?: number;
  overallScore: number;
  maturityLevel: MaturityLevel;
  inconclusive: boolean;
  inconclusiveReasons: string[];
  productProfile?: ProductExpectationResult;
  detectedStack: StackInfo;
  findings: Finding[];
  findingsByCategory: Record<Category, Finding[]>;
  criticalIssues: Finding[];
  warnings: Finding[];
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
