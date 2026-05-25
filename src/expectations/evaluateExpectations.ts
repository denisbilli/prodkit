import type { DetectorResult, ProjectAnalysis } from '../analyzer/types';
import type { Finding } from '../report/types';
import type {
  CapabilityEvaluation,
  CapabilityImportance,
  CapabilityStatus,
  ExpectationEvaluationOutput,
  ExpectedCapability,
  ProductExpectationResult,
  ProductProfile,
} from './types';
import { getProductProfile } from './productProfiles';

function detector(analysis: ProjectAnalysis, key: string): DetectorResult | undefined {
  return analysis.detectors[key];
}

function boolDetail(result: DetectorResult | undefined, key: string): boolean {
  return result?.details?.[key] === true;
}

function numberDetail(result: DetectorResult | undefined, key: string): number {
  const value = result?.details?.[key];
  return typeof value === 'number' ? value : 0;
}

function deriveStatus(analysis: ProjectAnalysis, capability: ExpectedCapability): CapabilityStatus {
  const sec = detector(analysis, 'security.core');
  const obs = detector(analysis, 'observability.core');
  const upload = detector(analysis, 'uploads.exposure');
  const authz = detector(analysis, 'authz.resourceLevel');
  const authzPerm = detector(analysis, 'authz.permissions');
  const authzRoles = detector(analysis, 'authz.roles');

  switch (capability.id) {
    case 'auth.baseline': {
      return detector(analysis, 'auth.core')?.present ? 'present' : 'missing';
    }
    case 'auth.api-keys': {
      return detector(analysis, 'auth.apiKeys')?.present ? 'present' : 'missing';
    }
    case 'authz.resource-level': {
      if (authz?.present || authzPerm?.present) return 'present';
      if (authzRoles?.present) return 'partial';
      return 'missing';
    }
    case 'tenancy.model': {
      const org = detector(analysis, 'tenancy.organization')?.present === true;
      const membership = detector(analysis, 'tenancy.membership')?.present === true;
      if (org && membership) return 'present';
      if (org || membership) return 'partial';
      return 'missing';
    }
    case 'gdpr.baseline': {
      const consent = detector(analysis, 'gdpr.consent.route')?.present === true;
      const exp = detector(analysis, 'gdpr.export.route')?.present === true;
      const erasure = detector(analysis, 'gdpr.erasure.route')?.present === true;
      const retention = detector(analysis, 'gdpr.retention.job')?.present === true;
      const score = Number(consent) + Number(exp) + Number(erasure) + Number(retention);
      if (score >= 3) return 'present';
      if (score >= 1) return 'partial';
      return 'missing';
    }
    case 'billing.baseline': {
      return detector(analysis, 'billing.stripe')?.present ? 'present' : 'missing';
    }
    case 'security.headers': {
      return boolDetail(sec, 'helmet') ? 'present' : 'missing';
    }
    case 'security.cors': {
      const strict = boolDetail(sec, 'corsStrict');
      const loose = boolDetail(sec, 'corsLoose');
      if (strict) return 'present';
      if (loose) return 'partial';
      return 'missing';
    }
    case 'security.rate-limit': {
      return boolDetail(sec, 'rateLimit') ? 'present' : 'missing';
    }
    case 'uploads.protection': {
      if (!upload?.present) return 'not_applicable';
      const exposed = boolDetail(upload, 'publicExposure');
      const protectedUploads = boolDetail(upload, 'protectedUploads');
      const validation = boolDetail(upload, 'validation');
      if (exposed) return protectedUploads ? 'partial' : 'missing';
      return validation || protectedUploads ? 'present' : 'partial';
    }
    case 'observability.health': {
      return boolDetail(obs, 'healthEndpoint') ? 'present' : 'missing';
    }
    case 'observability.logging': {
      const structured = boolDetail(obs, 'structuredLogging');
      const requestId = boolDetail(obs, 'requestId');
      if (structured && requestId) return 'present';
      if (structured || requestId) return 'partial';
      return 'missing';
    }
    case 'deployment.readiness': {
      const dep = detector(analysis, 'deployment.readiness');
      if (dep?.complete) return 'present';
      if (dep?.present) return 'partial';
      return 'missing';
    }
    case 'deployment.docker': {
      const d = detector(analysis, 'infra.docker');
      if (d?.complete) return 'present';
      if (d?.present) return 'partial';
      return 'missing';
    }
    case 'audit.baseline': {
      const structured = boolDetail(obs, 'structuredLogging');
      const requestId = boolDetail(obs, 'requestId');
      if (structured && requestId) return 'partial';
      if (structured || requestId) return 'partial';
      return 'missing';
    }
    case 'jobs.background': {
      return detector(analysis, 'jobs.background')?.present ? 'present' : 'missing';
    }
    default: {
      const matches = capability.detectorKeys
        .map((key) => detector(analysis, key))
        .filter(Boolean) as DetectorResult[];
      if (matches.length === 0) return 'unknown';
      if (matches.some((m) => m.present && m.complete !== false)) return 'present';
      if (matches.some((m) => m.present)) return 'partial';
      return 'missing';
    }
  }
}

function toFindingId(capability: ExpectedCapability, importance: CapabilityImportance): string {
  switch (capability.id) {
    case 'auth.baseline': return 'expectation.auth.required';
    case 'authz.resource-level': return 'expectation.authz.resource-level.required';
    case 'tenancy.model': return 'expectation.tenancy.required';
    case 'gdpr.baseline': return 'expectation.gdpr.required';
    case 'billing.baseline': return importance === 'required' ? 'expectation.billing.required' : 'expectation.billing.recommended';
    case 'security.headers': return 'expectation.security.headers.required';
    case 'security.cors': return 'expectation.security.cors.required';
    case 'security.rate-limit': return 'expectation.security.rate-limit.required';
    case 'uploads.protection': return 'expectation.uploads.required';
    case 'observability.health': return 'expectation.observability.health.required';
    case 'observability.logging': return importance === 'required' ? 'expectation.observability.logging.required' : 'expectation.observability.logging.recommended';
    case 'deployment.readiness': return 'expectation.deployment.required';
    case 'deployment.docker': return 'expectation.docker.recommended';
    case 'audit.baseline': return 'expectation.audit.recommended';
    case 'jobs.background': return 'expectation.jobs.recommended';
    case 'auth.api-keys': return 'expectation.auth.api-keys.recommended';
    default: return `expectation.${capability.id}.${importance}`;
  }
}

function severityFor(capability: ExpectedCapability, status: CapabilityStatus, importance: CapabilityImportance): Finding['severity'] {
  if (status === 'present' || status === 'not_applicable') return 'info';
  if (importance === 'required') {
    const criticalDomains = new Set(['auth', 'security', 'uploads', 'tenancy']);
    if (status === 'missing' && criticalDomains.has(capability.category)) return 'critical';
    if (status === 'missing') return 'high';
    if (status === 'partial') return 'medium';
    return 'low';
  }
  if (importance === 'recommended') {
    if (status === 'missing') return 'medium';
    if (status === 'partial') return 'low';
  }
  return 'info';
}

function scorePenalty(importance: CapabilityImportance, status: CapabilityStatus): number {
  if (status === 'present' || status === 'not_applicable' || status === 'unknown') return 0;
  if (importance === 'required') return status === 'missing' ? 15 : 8;
  if (importance === 'recommended') return status === 'missing' ? 7 : 3;
  return 0;
}

function shouldCreateFinding(importance: CapabilityImportance, status: CapabilityStatus): boolean {
  if (importance === 'not_applicable') return false;
  if (status === 'not_applicable' || status === 'present' || status === 'unknown') return false;
  if (importance === 'optional') return false;
  return true;
}

function evidenceFor(analysis: ProjectAnalysis, capability: ExpectedCapability): DetectorResult[] {
  return capability.detectorKeys
    .map((key) => detector(analysis, key))
    .filter(Boolean) as DetectorResult[];
}

export function evaluateExpectedCapabilities(args: {
  analysis: ProjectAnalysis;
  selectedProfile: Exclude<ProductProfile, 'auto' | 'observed-only'>;
  requestedProfile: ProductProfile;
  inferredProfile?: ProductProfile;
  inferenceConfidence?: 'low' | 'medium' | 'high';
}): ExpectationEvaluationOutput {
  const profile = getProductProfile(args.selectedProfile);
  const evaluations: CapabilityEvaluation[] = [];
  const findings: Finding[] = [];

  let score = 100;
  const authDetected = detector(args.analysis, 'auth.core')?.present === true;

  for (const cap of profile.capabilities) {
    let effectiveImportance = cap.importance;
    if (cap.id === 'gdpr.baseline' && profile.id === 'internal-tool' && !authDetected) {
      effectiveImportance = 'not_applicable';
    }

    const status = effectiveImportance === 'not_applicable'
      ? 'not_applicable'
      : deriveStatus(args.analysis, { ...cap, importance: effectiveImportance }) as CapabilityStatus;

    if (cap.id === 'uploads.protection' && status === 'not_applicable' && effectiveImportance === 'required') {
      effectiveImportance = 'not_applicable';
    }

    const findingId = toFindingId(cap, effectiveImportance);
    const severity = severityFor(cap, status, effectiveImportance);
    const detectorEvidence = evidenceFor(args.analysis, cap).flatMap((d) => d.evidence);

    const evaluation: CapabilityEvaluation = {
      capabilityId: cap.id,
      title: cap.title,
      category: cap.category,
      importance: effectiveImportance,
      status,
      findingId,
      severity,
      description: cap.description,
      recommendation: cap.recommendation,
      evidence: detectorEvidence,
    };
    evaluations.push(evaluation);

    score -= scorePenalty(effectiveImportance, status);

    if (shouldCreateFinding(effectiveImportance, status)) {
      findings.push({
        id: findingId,
        title: `${cap.title} (${effectiveImportance})`,
        category: cap.category,
        status: status === 'missing' ? 'missing' : 'partial',
        severity,
        description: `${cap.description} Current status: ${status}.`,
        recommendation: cap.recommendation,
        evidence: detectorEvidence.length > 0 ? detectorEvidence : [{ type: 'note', value: 'no direct evidence captured' }],
      });
    }
  }

  score = Math.max(0, Math.min(100, score));

  const result: ProductExpectationResult = {
    selectedProfile: args.selectedProfile,
    inferredProfile: args.inferredProfile,
    inferenceConfidence: args.inferenceConfidence,
    profileTitle: profile.title,
    profileDescription: profile.description,
    capabilities: evaluations,
    score,
  };

  return { result, findings };
}