import type { ProductionReadinessReport, Finding } from '../report/types';

export type RemediationEffort = 'small' | 'medium' | 'large';
export type RemediationRisk = 'low' | 'medium' | 'high';
export type RemediationAutomationReadiness = 'safe_template' | 'needs_review' | 'manual_only';
export type RemediationPriority = 'p0' | 'p1' | 'p2' | 'p3';
export type RemediationPhaseId = 'critical-blockers' | 'saas-safety-layer' | 'operational-readiness' | 'future-automation';

export interface RemediationTask {
  id: string;
  title: string;
  findingIds: string[];
  category: string;
  priority: RemediationPriority;
  effort: RemediationEffort;
  risk: RemediationRisk;
  automationReadiness: RemediationAutomationReadiness;
  why: string;
  recommendedApproach: string;
  likelyFiles: string[];
  suggestedTests: string[];
  acceptanceCriteria: string[];
  dependencies: string[];
}

export interface RemediationPhase {
  id: string;
  title: string;
  description: string;
  tasks: RemediationTask[];
}

export interface RemediationPlan {
  projectPath: string;
  generatedAt: string;
  score: number;
  maturityLevel: string;
  summary: string;
  phases: RemediationPhase[];
  tasks: RemediationTask[];
  quickWins: RemediationTask[];
  highRiskTasks: RemediationTask[];
  futureAutomationCandidates: RemediationTask[];
}

export interface RemediationCatalogEntry {
  taskId: string;
  title: string;
  category: string;
  phaseId: RemediationPhaseId;
  priority: RemediationPriority;
  effort: RemediationEffort;
  risk: RemediationRisk;
  automationReadiness: RemediationAutomationReadiness;
  why: string;
  recommendedApproach: string;
  likelyFiles: string[];
  suggestedTests: string[];
  acceptanceCriteria: string[];
  dependencies: string[];
  /**
   * This task is the general form of work that other capabilities describe precisely.
   *
   * `gdpr.privacy` says "implement consent, export/erasure workflows, and retention
   * policies" — which is the four GDPR capabilities restated as one sentence. Listed
   * beside them in the next steps, a reader does that work and then meets a step
   * telling them to do it. Marked here rather than inferred, so nothing is guessed:
   * naming the capabilities keeps the relationship checkable.
   */
  supersededBy?: string[];
}

export interface PlannedTaskSeed {
  finding: Finding;
  entry: RemediationCatalogEntry;
}

export interface PlanBuildInput {
  report: ProductionReadinessReport;
}