import type { DetectorEvidence, StackInfo } from '../analyzer/types';
import type { ProductExpectationResult, ProductProfile } from '../expectations/types';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type FindingStatus = 'passed' | 'missing' | 'partial' | 'unknown';

export type Category =
  | 'meta'
  | 'stack'
  | 'env'
  | 'auth'
  | 'authz'
  | 'tenancy'
  | 'gdpr'
  | 'security'
  | 'uploads'
  | 'billing'
  | 'audit'
  | 'observability'
  | 'jobs'
  | 'deployment';

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  category: Category;
  status: FindingStatus;
  description: string;
  evidence: DetectorEvidence[];
  recommendation: string;
}

export type MaturityLevel = 'prototype' | 'early' | 'partial' | 'production_ready';

export type ExpectationMode = 'observed-only' | 'explicit-profile' | 'auto-applied' | 'auto-inconclusive';

export interface ReportDiagnostics {
  analyzedFileCount: number;
  skippedFileCount: number;
  workspaceCount: number;
  detectorCount: number;
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
  productProfile?: ProductExpectationResult;
  detectedStack: StackInfo;
  findings: Finding[];
  findingsByCategory: Record<Category, Finding[]>;
  criticalIssues: Finding[];
  warnings: Finding[];
  passedChecks: Finding[];
  suggestedNextSteps: string[];
  technicalEvidence: Array<{ findingId: string; evidence: DetectorEvidence[] }>;
  diagnostics: ReportDiagnostics;
}
