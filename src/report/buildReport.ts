import type { ProjectAnalysis } from '../analyzer/types';
import { runRules } from '../rules/ruleEngine';
import { computeMaturity, computeScore } from './score';
import type { Category, Finding, ProductionReadinessReport } from './types';

const categories: Category[] = [
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
  'observability',
  'jobs',
  'deployment',
];

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

export function buildReport(analysis: ProjectAnalysis): ProductionReadinessReport {
  const findings = runRules(analysis).sort((a, b) => bySeverityPriority(a) - bySeverityPriority(b));
  const overallScore = computeScore(findings);
  const maturityLevel = computeMaturity(overallScore);

  const findingsByCategory = Object.fromEntries(categories.map((c) => [c, [] as Finding[]])) as Record<Category, Finding[]>;
  for (const f of findings) findingsByCategory[f.category].push(f);

  const criticalIssues = findings.filter((f) => f.severity === 'critical' && f.status !== 'passed');
  const warnings = findings.filter((f) => ['high', 'medium', 'low'].includes(f.severity) && f.status !== 'passed');
  const passedChecks = findings.filter((f) => f.status === 'passed');

  const suggestedNextSteps = findings
    .filter((f) => f.status !== 'passed' && f.status !== 'unknown')
    .slice(0, 10)
    .map((f) => `${f.title}: ${f.recommendation}`);

  const technicalEvidence = findings.map((f) => ({ findingId: f.id, evidence: f.evidence }));

  return {
    projectPath: analysis.projectPath,
    generatedAt: new Date().toISOString(),
    overallScore,
    maturityLevel,
    detectedStack: analysis.stack,
    findings,
    findingsByCategory,
    criticalIssues,
    warnings,
    passedChecks,
    suggestedNextSteps,
    technicalEvidence,
  };
}
