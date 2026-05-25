import type { ProjectAnalysis } from '../analyzer/types';
import type { Finding } from '../report/types';
import { rules } from './rules';

export function runRules(analysis: ProjectAnalysis): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    const finding = rule.evaluate({ analysis });
    if (finding) findings.push(finding);
  }
  return findings;
}
