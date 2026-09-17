import type { ProjectAnalysis } from '../analyzer/types';
import type { Finding } from '../report/types';
import { rules } from './rules';

export function runRules(analysis: ProjectAnalysis): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    const finding = rule.evaluate({ analysis });
    if (!finding) continue;

    /**
     * What this check is worth, taken from the rule rather than from the finding.
     *
     * A finding's `severity` drops to `info` the moment it passes, which is right for a
     * list of problems and wrong for measuring how much of a category is in good order:
     * a category that verified a critical control and failed three lesser ones had no
     * way to say the critical one is fine. Each rule declares its severity once, next
     * to itself, and that declaration survives the outcome.
     */
    findings.push({ ...finding, stakes: finding.stakes === 'info' ? rule.severity : finding.stakes });
  }
  return findings;
}
