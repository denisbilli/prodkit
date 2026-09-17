import type { Finding, ProductionReadinessReport } from './types';

function profileSummary(report: ProductionReadinessReport): string[] {
  const profile = report.productProfile;
  if (!profile) {
    return [
      '## Product Profile',
      '',
      '- Mode: observed-only',
      '- Expected capabilities: not evaluated',
      '',
    ];
  }

  if (report.expectedCapabilityScore === undefined || profile.capabilities.length === 0) {
    return [
      '## Product Profile',
      '',
      `- Mode: ${profile.selectedProfile}`,
      `- Inferred profile: ${profile.inferredProfile ?? 'not determined'}`,
      `- Inference confidence: ${profile.inferenceConfidence ?? 'n/a'}`,
      ...(profile.profileSuggestion ? [`- Looks like: ${profile.profileSuggestion.reason}`] : []),
      '- Expected capabilities: not evaluated',
      profile.note ? `- Note: ${profile.note}` : '- Note: profile inference was inconclusive',
      '',
    ];
  }

  const required = profile.capabilities.filter((c) => c.importance === 'required');
  const recommended = profile.capabilities.filter((c) => c.importance === 'recommended');

  const requiredPresent = required.filter((c) => c.status === 'present').length;
  const requiredMissing = required.filter((c) => c.status === 'missing').length;
  const requiredPartial = required.filter((c) => c.status === 'partial').length;

  const recommendedPresent = recommended.filter((c) => c.status === 'present').length;
  const recommendedMissing = recommended.filter((c) => c.status === 'missing').length;
  const recommendedPartial = recommended.filter((c) => c.status === 'partial').length;

  return [
    '## Product Profile',
    '',
    `- Selected profile: ${profile.selectedProfile}`,
    `- Profile: ${profile.profileTitle}`,
    `- Description: ${profile.profileDescription}`,
    `- Observed score: ${report.observedScore}/100`,
    `- Expected capability score: ${report.expectedCapabilityScore}/100`,
    `- Final score: ${report.overallScore}/100`,
    '- Capability summary:',
    `- Required: ${requiredPresent} present / ${requiredMissing} missing / ${requiredPartial} partial`,
    `- Recommended: ${recommendedPresent} present / ${recommendedMissing} missing / ${recommendedPartial} partial`,
    '',
  ];
}

function expectedGapSection(report: ProductionReadinessReport): string[] {
  const profile = report.productProfile;
  if (!profile || report.expectedCapabilityScore === undefined || profile.capabilities.length === 0) {
    return [];
  }

  const gaps = profile.capabilities.filter((c) =>
    (c.importance === 'required' || c.importance === 'recommended')
    && (c.status === 'missing' || c.status === 'partial')
  );

  return [
    '## Expected Capability Gaps',
    '',
    ...(gaps.length > 0
      ? gaps.map((gap) => `- [${gap.importance}] ${gap.title}: ${gap.status} (${gap.findingId})`)
      : ['- none']),
    '',
  ];
}

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
    ...(f.businessImpact ? [`- What this means: ${f.businessImpact}`] : []),
    `- Recommendation: ${f.recommendation}`,
    `- Confidence: ${f.confidence}`,
    `- Evidence quality: ${f.evidenceQuality}`,
    '- Evidence:',
    ev || '- note: no evidence',
    '',
  ].join('\n');
}

/**
 * The summary a non-technical reader sees first.
 *
 * It leads the document deliberately: the previous layout opened with the detected
 * stack and buried a severity tally under the heading "Executive Summary", which
 * answers a question nobody asked before deciding whether they can launch.
 */
function executiveSummarySection(report: ProductionReadinessReport): string[] {
  const summary = report.executiveSummary;

  return [
    '## Summary',
    '',
    summary.verdict,
    '',
    `- Launch ready: ${summary.launchReady ? 'yes' : 'no'}`,
    `- Score: ${summary.scoreExplanation}`,
    `- Estimated effort: ${summary.estimatedEffort}`,
    '',
    ...(summary.topRisks.length > 0
      ? ['**What is holding it back**', '', ...summary.topRisks.map((risk) => `- ${risk}`), '']
      : []),
    ...(summary.strengths.length > 0
      ? ['**What already works**', '', ...summary.strengths.map((strength) => `- ${strength}`), '']
      : []),
  ];
}

function categoryScoreSection(report: ProductionReadinessReport): string[] {
  const assessed = report.categoryScores.filter((entry) => !entry.notAssessed);
  if (assessed.length === 0) return [];

  return [
    '## Readiness by Area',
    '',
    '| Area | Score | Open findings | Critical |',
    '| --- | --- | --- | --- |',
    ...assessed.map(
      (entry) => `| ${entry.category} | ${entry.score}/100 | ${entry.findingCount} | ${entry.criticalCount} |`,
    ),
    '',
  ];
}

function complianceSection(report: ProductionReadinessReport): string[] {
  if (report.compliance.length === 0) return [];

  const unmet = report.compliance.filter((obligation) => !obligation.met);
  if (unmet.length === 0) return [];

  return [
    '## Compliance Exposure',
    '',
    '_Advisory mapping, not a compliance certification. Obligations nothing mapped to are omitted rather than reported as met._',
    '',
    '| Framework | Reference | Obligation | Findings |',
    '| --- | --- | --- | --- |',
    ...unmet.map(
      (obligation) =>
        `| ${obligation.framework} | ${obligation.reference} | ${obligation.title} | ${obligation.findingIds.length} |`,
    ),
    '',
  ];
}

export function renderMarkdown(report: ProductionReadinessReport): string {
  const severeCounts = {
    critical: report.findings.filter((f) => f.severity === 'critical' && f.status !== 'passed' && f.status !== 'unknown').length,
    high: report.findings.filter((f) => f.severity === 'high' && f.status !== 'passed' && f.status !== 'unknown').length,
    medium: report.findings.filter((f) => f.severity === 'medium' && f.status !== 'passed' && f.status !== 'unknown').length,
  };

  const byCategorySections = Object.entries(report.findingsByCategory)
    .map(([category, arr]) => [category, arr.filter((f) => f.status !== 'unknown')] as const)
    .filter(([, arr]) => arr.length > 0)
    .map(([category, arr]) => {
      return [`## Category: ${category}`, '', ...arr.map((f) => formatFinding(f))].join('\n');
    })
    .join('\n');

  const unknownFindings = report.findings.filter((f) => f.status === 'unknown');

  const passed = report.passedChecks.map((f) => `- ${f.title} (${f.id})`).join('\n') || '- none';
  const nextSteps = report.suggestedNextSteps.map((n) => `- ${n}`).join('\n') || '- none';
  const workspaceLines = report.detectedStack.workspaces.length === 0
    ? ['- none']
    : report.detectedStack.workspaces.map((ws) => {
      const stackBits = [
        ws.frontend.length > 0 ? `frontend: ${ws.frontend.join(', ')}` : null,
        ws.backend.length > 0 ? `backend: ${ws.backend.join(', ')}` : null,
        ws.databases.length > 0 ? `databases: ${ws.databases.join(', ')}` : null,
      ].filter(Boolean).join(' | ');
      const warningText = ws.warnings.length > 0 ? ` | warnings: ${ws.warnings.join('; ')}` : '';
      return `- ${ws.root}: ${ws.packageManager} (${ws.packageManagerConfidence})${stackBits ? ` | ${stackBits}` : ''}${warningText}`;
    });

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
    ...executiveSummarySection(report),
    ...categoryScoreSection(report),
    ...complianceSection(report),
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
    '### Workspace Breakdown',
    '',
    ...workspaceLines,
    '',
    '## Score',
    '',
    `- Overall score: ${report.overallScore}/100`,
    `- Observed score: ${report.observedScore}/100`,
    ...(report.expectedCapabilityScore !== undefined ? [`- Expected capability score: ${report.expectedCapabilityScore}/100`] : []),
    `- Maturity level: ${report.maturityLevel}${report.inconclusive ? ' (inconclusive)' : ''}`,
    /**
     * The denominator the score was missing.
     *
     * A score that starts at 100 and only subtracts reads the same whether nothing was
     * found or nothing was looked at. Two reports sat side by side at 90 and 94, and
     * one of them rested on two verified checks while the other rested on twelve.
     */
    `- Verified: ${report.diagnostics.verifiedChecks} of ${report.diagnostics.assessedChecks} checks that reached a verdict`,
    ...(report.overallScore > 84 && report.maturityLevel !== 'production_ready'
      ? ['- Note: the score is high because little was found, not because much was verified. Too few checks apply to this repository to call it production ready.']
      : []),
    ...(report.inconclusive
      ? [
        '- Assessment: INCONCLUSIVE — the score is capped because the project could not be recognized:',
        ...report.inconclusiveReasons.map((r) => `  - ${r}`),
      ]
      : []),
    `- Diagnostics: ${report.diagnostics.analyzedFileCount} analyzed / ${report.diagnostics.skippedFileCount} skipped / ${report.diagnostics.workspaceCount} workspaces / ${report.diagnostics.detectorCount} detectors`,
    `- Expectation mode: ${report.diagnostics.expectationMode}`,
    `- ProdKit version: ${report.diagnostics.prodkitVersion}`,
    `- Detector diagnostics: ${report.diagnostics.detectors.filter((d) => d.status === 'completed').length} completed / ${report.diagnostics.detectors.filter((d) => d.status === 'skipped').length} skipped`,
    '',
    ...profileSummary(report),
    ...expectedGapSection(report),
    '## Finding Counts',
    '',
    `- Critical findings: ${severeCounts.critical}`,
    `- High findings: ${severeCounts.high}`,
    `- Medium findings: ${severeCounts.medium}`,
    '',
    '## Critical Findings',
    '',
    ...(report.criticalIssues.length > 0 ? report.criticalIssues.map((f) => formatFinding(f)) : ['- none', '']),
    '## Not Applicable / Unknown',
    '',
    ...(unknownFindings.length > 0 ? unknownFindings.map((f) => formatFinding(f)) : ['- none', '']),
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
