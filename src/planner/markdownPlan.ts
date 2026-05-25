import type { RemediationPhase, RemediationPlan, RemediationTask } from './types';

function renderList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- none';
}

function renderApproach(approach: string): string {
  return renderList(approach.split(/\n+/).map((line) => line.trim()).filter(Boolean));
}

function renderTask(task: RemediationTask): string {
  return [
    `### ${task.title}`,
    '',
    `- ID: ${task.id}`,
    `- Finding IDs: ${task.findingIds.join(', ')}`,
    `- Category: ${task.category}`,
    `- Priority: ${task.priority}`,
    `- Effort: ${task.effort}`,
    `- Risk: ${task.risk}`,
    `- Automation readiness: ${task.automationReadiness}`,
    `- Why: ${task.why}`,
    '- Recommended approach:',
    renderApproach(task.recommendedApproach),
    '- Likely files or areas to inspect:',
    renderList(task.likelyFiles),
    '- Suggested tests:',
    renderList(task.suggestedTests),
    '- Acceptance criteria:',
    renderList(task.acceptanceCriteria),
    '- Dependencies:',
    renderList(task.dependencies),
    '',
  ].join('\n');
}

function renderPhase(phase: RemediationPhase): string {
  const tasks = phase.tasks.length > 0
    ? phase.tasks.map((task) => `- ${task.id}: ${task.title} [${task.priority}, ${task.effort}, ${task.risk}, ${task.automationReadiness}]`).join('\n')
    : '- none';

  return [
    `## ${phase.title}`,
    '',
    phase.description,
    '',
    tasks,
    '',
  ].join('\n');
}

export function renderMarkdownPlan(plan: RemediationPlan): string {
  const acceptanceChecklist = plan.tasks.length > 0
    ? plan.tasks.flatMap((task) => task.acceptanceCriteria.map((criterion) => `- [ ] ${task.title}: ${criterion}`)).join('\n')
    : '- [ ] No actionable remediation tasks were generated.';

  const quickWins = plan.quickWins.length > 0
    ? renderList(plan.quickWins.map((task) => `${task.id}: ${task.title}`))
    : '- none';

  const highRisk = plan.highRiskTasks.length > 0
    ? renderList(plan.highRiskTasks.map((task) => `${task.id}: ${task.title}`))
    : '- none';

  const futureAutomation = plan.futureAutomationCandidates.length > 0
    ? renderList(plan.futureAutomationCandidates.map((task) => `${task.id}: ${task.title} (${task.automationReadiness})`))
    : '- none';

  return [
    '# ProdKit Remediation Plan',
    '',
    `- Generated at: ${plan.generatedAt}`,
    `- Project path: ${plan.projectPath}`,
    `- Score: ${plan.score}/100`,
    `- Maturity level: ${plan.maturityLevel}`,
    '',
    '## Summary',
    '',
    plan.summary,
    '',
    '## Phases',
    '',
    ...plan.phases.map((phase) => renderPhase(phase)),
    '## Task Details',
    '',
    ...(plan.tasks.length > 0 ? plan.tasks.map((task) => renderTask(task)) : ['- none', '']),
    '## Quick Wins',
    '',
    quickWins,
    '',
    '## High Risk Tasks',
    '',
    highRisk,
    '',
    '## Future Automation Candidates',
    '',
    futureAutomation,
    '',
    '## Acceptance Checklist',
    '',
    acceptanceChecklist,
  ].join('\n');
}