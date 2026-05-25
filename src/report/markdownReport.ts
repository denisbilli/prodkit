import type { Finding, ProductionReadinessReport } from './types';

function formatFinding(f: Finding): string {
  const ev = f.evidence
    .slice(0, 6)
    .map((e) => {
      if (e.file && e.line) return `- ${e.type}: ${e.value} (${e.file}:${e.line})`;
      if (e.file) return `- ${e.type}: ${e.value} (${e.file})`;
      return `- ${e.type}: ${e.value}`;
    })
    .join('\n');

  return [
    `### ${f.title} (${f.severity.toUpperCase()} / ${f.status})`,
    '',
    `- ID: ${f.id}`,
    `- Category: ${f.category}`,
    `- Description: ${f.description}`,
    `- Recommendation: ${f.recommendation}`,
    '- Evidence:',
    ev || '- note: no evidence',
    '',
  ].join('\n');
}

export function renderMarkdown(report: ProductionReadinessReport): string {
  const severeCounts = {
    critical: report.findings.filter((f) => f.severity === 'critical' && f.status !== 'passed').length,
    high: report.findings.filter((f) => f.severity === 'high' && f.status !== 'passed').length,
    medium: report.findings.filter((f) => f.severity === 'medium' && f.status !== 'passed').length,
  };

  const byCategorySections = Object.entries(report.findingsByCategory)
    .filter(([, arr]) => arr.length > 0)
    .map(([category, arr]) => {
      return [`## Category: ${category}`, '', ...arr.map((f) => formatFinding(f))].join('\n');
    })
    .join('\n');

  const passed = report.passedChecks.map((f) => `- ${f.title} (${f.id})`).join('\n') || '- none';
  const nextSteps = report.suggestedNextSteps.map((n) => `- ${n}`).join('\n') || '- none';

  const appendix = report.technicalEvidence
    .map((te) => {
      const body = te.evidence
        .map((e) => {
          if (e.file && e.line) return `- ${e.type}: ${e.value} (${e.file}:${e.line})`;
          if (e.file) return `- ${e.type}: ${e.value} (${e.file})`;
          return `- ${e.type}: ${e.value}`;
        })
        .join('\n');
      return `### ${te.findingId}\n${body || '- none'}\n`;
    })
    .join('\n');

  return [
    '# ProdKit Production Readiness Report',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Project path: ${report.projectPath}`,
    '',
    '## Detected Stack',
    '',
    `- Frontend: ${report.detectedStack.frontend.join(', ') || 'unknown'}`,
    `- Backend: ${report.detectedStack.backend.join(', ') || 'unknown'}`,
    `- Databases: ${report.detectedStack.databases.join(', ') || 'unknown'}`,
    `- Languages: ${report.detectedStack.languages.join(', ') || 'unknown'}`,
    `- Package manager: ${report.detectedStack.packageManager}`,
    `- Package manager confidence: ${report.detectedStack.packageManagerConfidence}`,
    `- Package manager warnings: ${report.detectedStack.warnings.join(', ') || 'none'}`,
    '',
    '## Score',
    '',
    `- Overall score: ${report.overallScore}/100`,
    `- Maturity level: ${report.maturityLevel}`,
    '',
    '## Executive Summary',
    '',
    `- Critical findings: ${severeCounts.critical}`,
    `- High findings: ${severeCounts.high}`,
    `- Medium findings: ${severeCounts.medium}`,
    '',
    '## Critical Findings',
    '',
    ...(report.criticalIssues.length > 0 ? report.criticalIssues.map((f) => formatFinding(f)) : ['- none', '']),
    byCategorySections,
    '## Passed Checks',
    '',
    passed,
    '',
    '## Suggested Next Steps',
    '',
    nextSteps,
    '',
    '## Appendix: Technical Evidence',
    '',
    appendix,
  ].join('\n');
}
