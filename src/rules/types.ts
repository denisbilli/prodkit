import type { ProjectAnalysis } from '../analyzer/types';
import type { Category, Finding, Severity } from '../report/types';

export interface RuleContext {
  analysis: ProjectAnalysis;
}

export interface Rule {
  id: string;
  title: string;
  category: Category;
  severity: Severity;
  evaluate: (ctx: RuleContext) => Finding | null;
}
