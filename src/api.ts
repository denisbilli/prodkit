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
 * Optional AI layer.
 *
 * Advisory only: nothing here changes the deterministic score, and every entry point
 * requires an Anthropic API key plus the optional @anthropic-ai/sdk package, so the
 * deterministic analysis is unaffected when neither is present.
 *
 * Exported so the cloud can consume it as a library — until now it was reachable only
 * through the CLI flags, which meant a server-side caller could not use it at all.
 * When the AI layer moves to its own commercial package these exports move with it.
 */
export { inferStackWithAi, reviewCodeWithAi } from './ai/enrich';
export { AiUnavailableError, assertAiAvailable, REVIEW_MODEL, STACK_MODEL } from './ai/client';
export { redactSecrets, containsSecret } from './ai/redact';
export { buildRepoSample, selectSampleFiles } from './ai/sample';
export type { RepoSample, RepoSampleFile, SampleOptions } from './ai/sample';
export type { AiOptions, AiReview, AiFinding, AiStackHint, AiMode } from './ai/types';