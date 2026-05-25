import type { DetectorEvidence, StackInfo } from '../analyzer/types';

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

export interface ProductionReadinessReport {
  projectPath: string;
  generatedAt: string;
  overallScore: number;
  maturityLevel: MaturityLevel;
  detectedStack: StackInfo;
  findings: Finding[];
  findingsByCategory: Record<Category, Finding[]>;
  criticalIssues: Finding[];
  warnings: Finding[];
  passedChecks: Finding[];
  suggestedNextSteps: string[];
  technicalEvidence: Array<{ findingId: string; evidence: DetectorEvidence[] }>;
}
