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
  /**
   * The capabilities that say precisely what this task says generally.
   *
   * Carried on the state so the plan can be checked for the general form and its
   * specific forms both being present, which is the one thing a reader cannot see for
   * themselves: two steps that read differently and are the same work.
   */
  supersededBy?: string[];
}

/**
 * Removes a task whose work is fully described by other tasks in the same plan.
 *
 * `gdpr.privacy` says "implement consent, export/erasure workflows, and retention
 * policies", which is four GDPR capabilities restated as one sentence. Twelve of the
 * seventy-eight repositories in the verification corpus got that step *and* all of the
 * steps it summarises: a reader does the work and then meets an item telling them to do
 * it. The catalogue has recorded the relationship since it was written and nothing read
 * the field.
 *
 * Only when nothing the general task covers is left outstanding: every superseding
 * capability is either in the plan already or was not a problem in the first place. With
 * two of four present and the other two still open, the general task is the only step
 * that reaches them, and dropping it would lose the work.
 *
 * The dropped task's finding keeps a step: its id moves onto the tasks that replace it,
 * so nothing falls out of the plan's account of what it is answering.
 */
function dropSupersededTasks(
  states: PlannedTaskState[],
  actionableFindingIds: ReadonlySet<string>,
): PlannedTaskState[] {
  const plannedFindingIds = new Set(states.flatMap((state) => state.task.findingIds));

  const survivors: PlannedTaskState[] = [];
  const reassigned = new Map<string, string[]>();

  for (const state of states) {
    const superseders = state.supersededBy ?? [];

    /**
     * A capability that was never a problem needs no step, so it cannot be the reason
     * the general task survives — but at least one of them has to be in the plan, or
     * this task is the only thing pointing at the work. That is the observed-only case:
     * no expectations ran, so none of the specific steps exist.
     */
    const outstanding = superseders.filter((id) => !plannedFindingIds.has(id) && actionableFindingIds.has(id));
    const anyPlanned = superseders.some((id) => plannedFindingIds.has(id));
    const fullyCovered = superseders.length > 0 && anyPlanned && outstanding.length === 0;

    if (!fullyCovered) {
      survivors.push(state);
      continue;
    }

    for (const findingId of superseders) {
      reassigned.set(findingId, [...(reassigned.get(findingId) ?? []), ...state.task.findingIds]);
    }
  }

  return survivors.map((state) => {
    const inherited = state.task.findingIds.flatMap((id) => reassigned.get(id) ?? []);
    if (inherited.length === 0) return state;

    return { ...state, task: { ...state.task, findingIds: unique([...state.task.findingIds, ...inherited]) } };
  });
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

function rankStates(states: PlannedTaskState[]): PlannedTaskState[] {
  return [...states].sort((left, right) => {
    const priorityDelta = priorityOrder[left.task.priority] - priorityOrder[right.task.priority];
    if (priorityDelta !== 0) return priorityDelta;
    const severityDelta = left.severityRank - right.severityRank;
    if (severityDelta !== 0) return severityDelta;
    return left.task.title.localeCompare(right.task.title);
  });
}

/**
 * Orders tasks by urgency, then reorders so that no task is listed before a task it
 * depends on.
 *
 * Ranking alone produced plans that could not be followed in the order given: with
 * priority, severity and title as the only keys, "Enforce tenant isolation on every
 * query" sorted above "Implement an explicit authentication baseline" purely because
 * E precedes I, even though the first is unreachable without the second.
 *
 * Dependencies pointing outside the current plan are ignored — a task is not blocked
 * by work the repository does not need. A dependency cycle degrades to plain ranking
 * for the tasks involved rather than dropping them.
 */
function sortStates(states: PlannedTaskState[]): PlannedTaskState[] {
  const ranked = rankStates(states);
  const pending = new Map(ranked.map((state) => [state.task.id, state]));
  const emitted = new Set<string>();
  const ordered: PlannedTaskState[] = [];

  while (pending.size > 0) {
    const ready = ranked.find(
      (state) =>
        pending.has(state.task.id) &&
        state.task.dependencies.every((dependency) => !pending.has(dependency) || emitted.has(dependency)),
    );

    // No task has all its dependencies satisfied: the remainder forms a cycle, so fall
    // back to ranked order for it instead of looping forever or dropping tasks.
    const next = ready ?? ranked.find((state) => pending.has(state.task.id));
    if (!next) break;

    ordered.push(next);
    emitted.add(next.task.id);
    pending.delete(next.task.id);
  }

  return ordered;
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
        supersededBy: entry.supersededBy,
      });
    }
  }

  const states = sortStates(
    dropSupersededTasks(
      Array.from(taskStates.values()),
      new Set(actionableFindings.map((finding) => finding.id)),
    ),
  );
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