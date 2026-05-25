import type { Finding, ProductionReadinessReport } from '../report/types';
import type {
  PlannedTaskSeed,
  RemediationPhase,
  RemediationPhaseId,
  RemediationPlan,
  RemediationPriority,
  RemediationTask,
} from './types';
import { getRemediationEntry } from './remediationCatalog';

const priorityOrder: Record<RemediationPriority, number> = {
  p0: 0,
  p1: 1,
  p2: 2,
  p3: 3,
};

const severityOrder: Record<Finding['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const phaseMeta: Record<RemediationPhaseId, { title: string; description: string }> = {
  'critical-blockers': {
    title: 'Critical production blockers',
    description: 'Fix the items most likely to cause immediate security, auth, or data-loss regressions.',
  },
  'saas-safety-layer': {
    title: 'SaaS safety layer',
    description: 'Add tenant, authorization, and privacy controls before scaling the product surface.',
  },
  'operational-readiness': {
    title: 'Operational readiness',
    description: 'Harden runtime behavior, logging, health, and deployment reproducibility.',
  },
  'future-automation': {
    title: 'Future automation candidates',
    description: 'Tasks that are good candidates for safe templates or later AI-assisted remediation.',
  },
};

interface PlannedTaskState {
  task: RemediationTask;
  phaseId: RemediationPhaseId;
  severityRank: number;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractEvidenceFiles(finding: Finding): string[] {
  return finding.evidence.flatMap((e) => (e.file ? [e.file] : []));
}

function buildTask(seed: PlannedTaskSeed, evidenceFiles: string[]): RemediationTask {
  const { entry, finding } = seed;
  return {
    id: entry.taskId,
    title: entry.title,
    findingIds: [finding.id],
    category: entry.category,
    priority: entry.priority,
    effort: entry.effort,
    risk: entry.risk,
    automationReadiness: entry.automationReadiness,
    why: entry.why,
    recommendedApproach: entry.recommendedApproach,
    likelyFiles: unique([...evidenceFiles, ...entry.likelyFiles]),
    suggestedTests: [...entry.suggestedTests],
    acceptanceCriteria: [...entry.acceptanceCriteria],
    dependencies: [...entry.dependencies],
  };
}

function mergeTask(existing: RemediationTask, seed: PlannedTaskSeed, evidenceFiles: string[]): RemediationTask {
  return {
    ...existing,
    findingIds: unique([...existing.findingIds, seed.finding.id]),
    likelyFiles: unique([...existing.likelyFiles, ...evidenceFiles, ...seed.entry.likelyFiles]),
    suggestedTests: unique([...existing.suggestedTests, ...seed.entry.suggestedTests]),
    acceptanceCriteria: unique([...existing.acceptanceCriteria, ...seed.entry.acceptanceCriteria]),
    dependencies: unique([...existing.dependencies, ...seed.entry.dependencies]),
  };
}

function sortStates(states: PlannedTaskState[]): PlannedTaskState[] {
  return [...states].sort((left, right) => {
    const priorityDelta = priorityOrder[left.task.priority] - priorityOrder[right.task.priority];
    if (priorityDelta !== 0) return priorityDelta;
    const severityDelta = left.severityRank - right.severityRank;
    if (severityDelta !== 0) return severityDelta;
    return left.task.title.localeCompare(right.task.title);
  });
}

function summarizePlan(tasks: RemediationTask[], actionableFindingCount: number): string {
  if (tasks.length === 0) {
    return 'ProdKit found no actionable remediation tasks from the current deterministic findings.';
  }

  const quickWins = tasks.filter((task) => task.effort === 'small' && (task.risk === 'low' || task.risk === 'medium')).length;
  const highRisk = tasks.filter((task) => task.risk === 'high').length;
  return `${tasks.length} actionable remediation task(s) from ${actionableFindingCount} actionable finding(s), ${quickWins} quick win(s), and ${highRisk} high-risk item(s).`;
}

function buildPhases(states: PlannedTaskState[]): RemediationPhase[] {
  const phaseIds: RemediationPhaseId[] = ['critical-blockers', 'saas-safety-layer', 'operational-readiness'];
  const phaseBuckets = new Map<RemediationPhaseId, PlannedTaskState[]>();
  for (const phaseId of phaseIds) phaseBuckets.set(phaseId, []);

  for (const state of states) {
    const bucket = phaseBuckets.get(state.phaseId);
    if (bucket) bucket.push(state);
  }

  const phases: RemediationPhase[] = phaseIds.map((phaseId) => ({
    id: phaseId,
    title: phaseMeta[phaseId].title,
    description: phaseMeta[phaseId].description,
    tasks: sortStates(phaseBuckets.get(phaseId) ?? []).map((state) => state.task),
  }));

  const futureAutomationTasks = sortStates(states.filter((state) => state.task.automationReadiness !== 'manual_only')).map((state) => state.task);
  phases.push({
    id: 'future-automation',
    title: phaseMeta['future-automation'].title,
    description: phaseMeta['future-automation'].description,
    tasks: futureAutomationTasks,
  });

  return phases;
}

export function buildPlan(report: ProductionReadinessReport): RemediationPlan {
  const actionableFindings = report.findings.filter((finding) => finding.status !== 'passed' && finding.status !== 'unknown');
  const taskStates = new Map<string, PlannedTaskState>();

  for (const finding of actionableFindings) {
    const entry = getRemediationEntry(finding.id);
    if (!entry) continue;

    const seed: PlannedTaskSeed = { finding, entry };
    const evidenceFiles = extractEvidenceFiles(finding);
    const existing = taskStates.get(entry.taskId);
    if (existing) {
      existing.task = mergeTask(existing.task, seed, evidenceFiles);
      existing.severityRank = Math.min(existing.severityRank, severityOrder[finding.severity]);
    } else {
      taskStates.set(entry.taskId, {
        task: buildTask(seed, evidenceFiles),
        phaseId: entry.phaseId,
        severityRank: severityOrder[finding.severity],
      });
    }
  }

  const states = sortStates(Array.from(taskStates.values()));
  const tasks = states.map((state) => state.task);
  const phases = buildPhases(states);
  const quickWins = tasks.filter((task) => task.effort === 'small' && (task.risk === 'low' || task.risk === 'medium'));
  const highRiskTasks = tasks.filter((task) => task.risk === 'high');
  const futureAutomationCandidates = tasks.filter((task) => task.automationReadiness !== 'manual_only');

  return {
    projectPath: report.projectPath,
    generatedAt: new Date().toISOString(),
    score: report.overallScore,
    maturityLevel: report.maturityLevel,
    summary: summarizePlan(tasks, actionableFindings.length),
    phases,
    tasks,
    quickWins,
    highRiskTasks,
    futureAutomationCandidates,
  };
}