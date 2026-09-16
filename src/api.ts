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
export type { CategoryScore } from './report/categoryScores';
export type { ExecutiveSummary } from './report/executiveSummary';
export type { ComplianceObligation, ComplianceFramework } from './report/complianceMapping';
export type { CapabilityGap } from './expectations/types';
export type { FindingConfidence, EvidenceQuality } from './report/types';
export type { RemediationPlan, RemediationTask, RemediationPhase } from './planner/types';
export type { BuildReportOptions } from './report/buildReport';
export { PRODKit_VERSION } from './version';

/**
 * Safe file reading, exported because consumers that sample a repository need the
 * same guarantees the analyzer relies on: binaries and oversized files are skipped,
 * and a read never throws.
 */
export { readTextFileSafe, readJsonSafe } from './utils/readTextFileSafe';

/**
 * The optional AI layer is NOT exported here.
 *
 * It is a separate commercial package, `@produtype/ai`, which this one neither depends
 * on nor ships. Re-exporting it would pull it back into this tarball through the
 * dependency graph and undo the split.
 */
