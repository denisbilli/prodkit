export { analyzeProject } from './analyzer/analyzeProject';
export { buildReport } from './report/buildReport';
export { renderMarkdown } from './report/markdownReport';
export { renderJson } from './report/jsonReport';
export { buildPlan } from './planner/buildPlan';
export { renderMarkdownPlan } from './planner/markdownPlan';
export { renderJsonPlan } from './planner/jsonPlan';

export type { ProjectAnalysis, StackInfo, DetectorEvidence } from './analyzer/types';
export type {
	ProductProfile,
	ProductExpectationResult,
	CapabilityEvaluation,
	CapabilityStatus,
	CapabilityImportance,
} from './expectations/types';
export type { ProductionReadinessReport, Finding, MaturityLevel, ReportDiagnostics, ExpectationMode } from './report/types';
export type { RemediationPlan, RemediationTask, RemediationPhase } from './planner/types';
export type { BuildReportOptions } from './report/buildReport';
export { PRODKit_VERSION } from './version';