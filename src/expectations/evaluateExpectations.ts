import type { DetectorEvidence, DetectorResult, ProjectAnalysis } from '../analyzer/types';
import type { Finding } from '../report/types';
import type {
  CapabilityEvaluation,
  CapabilityGap,
  CapabilityImportance,
  CapabilityStatus,
  DeclaredIntent,
  ExpectationEvaluationOutput,
  ExpectedCapability,
  ProductExpectationResult,
  ProductProfile,
} from './types';
import { CAPABILITIES, type CapabilityId, getProductProfile } from './productProfiles';
import type { EvidenceQuality, FindingConfidence } from '../report/types';

function detector(analysis: ProjectAnalysis, key: string): DetectorResult | undefined {
  return analysis.detectors[key];
}

function boolDetail(result: DetectorResult | undefined, key: string): boolean {
  return result?.details?.[key] === true;
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
    case 'auth.mfa': {
      return detector(analysis, 'auth.2fa')?.present ? 'present' : 'missing';
    }
    case 'auth.password-reset': {
      if (detector(analysis, 'auth.passwordReset')?.present) return 'present';

      // A product that authenticates only through an external identity provider has no
      // password to reset, so demanding the flow is a defect in the question, not in
      // the repository. Requires an auth baseline: no auth at all is still missing.
      const managedOnly = detector(analysis, 'auth.externalIdentityOnly')?.present === true;
      if (managedOnly && detector(analysis, 'auth.core')?.present === true) return 'not_applicable';

      return 'missing';
    }
    case 'auth.email-verification': {
      return detector(analysis, 'auth.emailVerification')?.present ? 'present' : 'missing';
    }
    case 'authz.roles': {
      if (authzPerm?.present) return 'present';
      if (authzRoles?.present) return 'partial';
      return 'missing';
    }
    case 'authz.ownership': {
      return authz?.present ? 'present' : 'missing';
    }
    case 'tenancy.organization': {
      return detector(analysis, 'tenancy.organization')?.present ? 'present' : 'missing';
    }
    case 'tenancy.isolation': {
      return detector(analysis, 'tenancy.membership')?.present ? 'present' : 'missing';
    }
    case 'gdpr.consent': {
      return detector(analysis, 'gdpr.consent.route')?.present ? 'present' : 'missing';
    }
    case 'gdpr.export': {
      return detector(analysis, 'gdpr.export.route')?.present ? 'present' : 'missing';
    }
    case 'gdpr.erasure': {
      return detector(analysis, 'gdpr.erasure.route')?.present ? 'present' : 'missing';
    }
    case 'gdpr.retention': {
      return detector(analysis, 'gdpr.retention.job')?.present ? 'present' : 'missing';
    }
    case 'billing.model': {
      return detector(analysis, 'billing.stripe')?.present ? 'present' : 'missing';
    }
    case 'billing.webhook-integrity': {
      // Only meaningful once a payment integration exists at all.
      if (detector(analysis, 'billing.stripe')?.present !== true) return 'not_applicable';

      const signature = detector(analysis, 'billing.webhook.signatureValidation')?.present === true;
      const rawBody = detector(analysis, 'billing.webhook.rawBody')?.present === true;
      const secret = detector(analysis, 'billing.webhook.secret')?.present === true;
      const route = detector(analysis, 'billing.webhook.route')?.present === true;

      if (!route) return 'missing';
      if (signature && rawBody && secret) return 'present';
      if (signature || rawBody || secret) return 'partial';
      return 'missing';
    }
    case 'security.headers': {
      return boolDetail(sec, 'helmet') ? 'present' : 'missing';
    }
    case 'security.cors': {
      const strict = boolDetail(sec, 'corsStrict');
      const loose = boolDetail(sec, 'corsLoose');
      if (strict) return 'present';
      if (loose) return 'partial';

      /**
       * A cross-origin policy is only a question for something that answers
       * cross-origin requests.
       *
       * A server-rendered monolith with no API, no CORS library installed and no
       * cross-origin handling anywhere is not missing a policy — the browser's own
       * default already refuses those requests, and the absence *is* the safe
       * configuration. Reporting it as a critical gap rewards adding middleware that
       * can only loosen what is currently closed.
       *
       * An independent review of a report on a Django school platform put it as
       * "not applicable, and inverted". It was right.
       */
      return servesCrossOrigin(analysis) ? 'missing' : 'not_applicable';
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
      /**
       * Read from the audit trail, not from the logs.
       *
       * This used to be decided by structured logging and a request id, which answer
       * "can we debug this?" — a different question from "can we say, months later,
       * who deleted that organisation?". Logs rotate; an audit trail is meant not to.
       *
       * It also could not return `present`. Both branches returned `partial`, so a
       * project with a complete audit trail was marked down for it permanently, on a
       * capability the b2b-saas profile asks for.
       */
      const trail = detector(analysis, 'audit.trail');
      if (trail?.present && trail.complete) return 'present';
      if (trail?.present) return 'partial';

      // Structured logging with a request id is not an audit trail, but it is not
      // nothing either: the events can often be reconstructed from it.
      const structured = boolDetail(obs, 'structuredLogging');
      const requestId = boolDetail(obs, 'requestId');
      if (structured && requestId) return 'partial';

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

/**
 * Penalty at which the expected-capability score decays to 1/e (about 37).
 *
 * Tuned against the worst case of the richest profile: ai-saas accumulates roughly
 * 320 penalty points when a repository satisfies none of its expectations, and the
 * value below places that case near 28 while leaving a static site — which expects
 * almost nothing — above 90. Retune this whenever the capability catalogue grows,
 * otherwise the demanding profiles compress against zero and stop being comparable.
 */
const EXPECTATION_DECAY = 250;

function accumulateGap(gap: CapabilityGap, importance: CapabilityImportance, status: CapabilityStatus): void {
  if (importance === 'not_applicable' || status === 'unknown') return;

  gap.applicableTotal += 1;
  if (status === 'present' || status === 'not_applicable') {
    gap.satisfied += 1;
  }

  if (importance === 'required') {
    gap.requiredTotal += 1;
    if (status === 'missing') gap.requiredMissing += 1;
    if (status === 'partial') gap.requiredPartial += 1;
    return;
  }

  if (importance === 'recommended') {
    gap.recommendedTotal += 1;
    if (status === 'missing') gap.recommendedMissing += 1;
    if (status === 'partial') gap.recommendedPartial += 1;
  }
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

/**
 * Whether anything here could receive a cross-origin request.
 *
 * An API surface, a framework built to serve one, or a CORS library someone installed
 * on purpose. None of the three means the question does not arise.
 */
function servesCrossOrigin(analysis: ProjectAnalysis): boolean {
  // Somebody wrote cross-origin handling, however badly: the question plainly arises.
  const sec = detector(analysis, 'security.core');
  if (sec?.evidence.some((item) => /cors/i.test(String(item.value)))) return true;

  // An API meant for other callers.
  if (detector(analysis, 'auth.apiKeys')?.present) return true;

  return analysis.files.source.some((file) => /(^|\/)(api|routes?|controllers?|serializers?|graphql)(\/|\.)/i.test(file));
}

/**
 * How good the evidence is, judged on the evidence the reader is actually shown.
 *
 * This used to read the detectors whole, while the finding displayed only the lines
 * tagged with its own claim. The two came apart the moment claims were introduced: the
 * one critical finding in a real report — "rate limiting on risk surfaces", the finding
 * that decided "launch ready: no" — announced high confidence and strong evidence
 * quality directly above the line "no direct evidence captured". It had been graded on
 * four `SECURE_HSTS_SECONDS` snippets it no longer showed, because they are evidence
 * about headers.
 *
 * A claim is only as good as what can be put in front of the reader.
 */
function evidenceQualityFor(evidence: DetectorEvidence[]): EvidenceQuality {
  if (evidence.some((item) => item.type === 'file' && typeof item.line === 'number')) {
    return 'strong';
  }

  if (evidence.some((item) => item.type === 'file' || item.type === 'snippet')) {
    return 'strong';
  }

  if (evidence.some((item) => item.type === 'dependency')) {
    return 'medium';
  }

  return 'weak';
}

/**
 * How sure the analyzer is about *this* finding.
 *
 * It used to fold in how the profile was chosen: on `auto` — which is what the hosted
 * product uses by default — every finding came out low or medium however strong its
 * evidence. Two different uncertainties were being multiplied into one number, and the
 * profile's own uncertainty is already reported separately as `inferenceConfidence`.
 *
 * An independent review of a real report put it plainly: eleven findings of
 * thirty-two carried "no direct evidence captured" at low confidence and weak
 * evidence, and still arrived as critical or high.
 */
function confidenceFor(status: CapabilityStatus, evidenceQuality: EvidenceQuality): FindingConfidence {
  // Nothing was determined, so there is nothing to be confident about.
  if (status === 'unknown') return 'low';

  if (evidenceQuality === 'strong') return 'high';
  if (evidenceQuality === 'medium') return 'medium';
  return 'low';
}

/**
 * Severity says how bad it would be if true. Confidence says whether it is.
 *
 * A reader treats `critical` as "stop and fix this", and spending that word on a claim
 * the analyzer itself is unsure of is how a tool becomes a checklist nobody trusts.
 * The claim stays, at the weight the evidence supports.
 */
function severityForConfidence(severity: Finding['severity'], confidence: FindingConfidence): Finding['severity'] {
  if (confidence !== 'low') return severity;

  /**
   * `critical` only. Not a ceiling at `medium`, which was the first attempt and was
   * wrong for a reason worth writing down: a missing capability cannot carry direct
   * evidence — there is no line to point at for something that is not there — so every
   * absence reads as low confidence, and capping them all at `medium` would leave the
   * report unable to say anything is serious.
   *
   * What it can stop doing is shouting. `critical` is read as "stop and fix this
   * before anything else", and the analyzer should not spend that word on a claim it
   * could not evidence.
   */
  return severity === 'critical' ? 'high' : severity;
}

/**
 * Which capabilities each declaration makes required.
 *
 * One declaration usually implies several: saying you handle personal data is saying
 * you owe consent, export, erasure and a retention position, not one of the four.
 */
const DECLARED_CAPABILITIES: Record<keyof DeclaredIntent, CapabilityId[]> = {
  handlesPersonalData: ['gdpr.consent', 'gdpr.export', 'gdpr.erasure', 'gdpr.retention'],
  hasFileUploads: ['uploads.protection'],
  requiresTenantIsolation: ['tenancy.organization', 'tenancy.isolation'],
  hasBilling: ['billing.model', 'billing.webhook-integrity'],
};

const IMPORTANCE_RANK: Record<CapabilityImportance, number> = {
  not_applicable: 0,
  optional: 1,
  recommended: 2,
  required: 3,
};

/**
 * The profile's capabilities, with what the owner declared folded in.
 *
 * Raising only, never lowering, and adding a capability the profile does not carry
 * when the declaration calls for it — a static site that says it takes payments is
 * asking to be judged on payments, and the static-site profile has nothing to say
 * about them.
 */
function applyDeclarations(
  capabilities: ExpectedCapability[],
  declared: DeclaredIntent | undefined,
): ExpectedCapability[] {
  if (!declared) return capabilities;

  const required = new Set<string>();

  for (const [key, ids] of Object.entries(DECLARED_CAPABILITIES) as Array<[keyof DeclaredIntent, CapabilityId[]]>) {
    // Only a `true` does anything. `false` is not evidence of absence, and treating it
    // as such would let anyone switch a finding off by answering a form.
    if (declared[key] === true) for (const id of ids) required.add(id);
  }

  if (required.size === 0) return capabilities;

  const out = capabilities.map((cap) =>
    required.has(cap.id) && IMPORTANCE_RANK[cap.importance] < IMPORTANCE_RANK.required
      ? { ...cap, importance: 'required' as CapabilityImportance }
      : cap,
  );

  const present = new Set(out.map((cap) => cap.id));

  for (const id of required) {
    if (!present.has(id)) out.push({ ...CAPABILITIES[id as CapabilityId], importance: 'required' });
  }

  return out;
}

export function evaluateExpectedCapabilities(args: {
  analysis: ProjectAnalysis;
  selectedProfile: Exclude<ProductProfile, 'auto' | 'observed-only'>;
  requestedProfile: ProductProfile;
  inferredProfile?: ProductProfile;
  inferenceConfidence?: 'low' | 'medium' | 'high';
  declared?: DeclaredIntent;
}): ExpectationEvaluationOutput {
  const profile = getProductProfile(args.selectedProfile);
  const evaluations: CapabilityEvaluation[] = [];
  const findings: Finding[] = [];

  // A demanding profile accumulates well over 100 points of penalty when nothing is
  // present (b2b-saas reaches ~163, ai-saas ~185), so the original `100 - penalty`
  // clamped to zero and collapsed every demanding profile onto the same score —
  // destroying the profile comparison the product is built on.
  //
  // Normalising by the profile's own worst case is not the answer either: it maps
  // "all expectations missed" to 0 for every profile, which erases the fact that a
  // static site missing everything is far closer to shippable than a marketplace
  // missing everything.
  //
  // Exponential decay keeps the penalty absolute (a profile that expects more scores
  // lower for the same repository) while never saturating, so the ordering between
  // profiles survives at both ends of the scale.
  let penalty = 0;
  const gap: CapabilityGap = {
    applicableTotal: 0,
    satisfied: 0,
    requiredTotal: 0,
    requiredMissing: 0,
    requiredPartial: 0,
    recommendedTotal: 0,
    recommendedMissing: 0,
    recommendedPartial: 0,
  };
  const authDetected = detector(args.analysis, 'auth.core')?.present === true;

  for (const cap of applyDeclarations(profile.capabilities, args.declared)) {
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
    const claimedSeverity = severityFor(cap, status, effectiveImportance);
    /**
     * Only the evidence for this capability's own claim.
     *
     * A detector that answers several questions returns one array, and a capability
     * naming that detector used to show all of it. On a real Django project that made
     * the same four `SECURE_HSTS_SECONDS` lines the cited evidence for missing rate
     * limiting — the reader opens the finding, sees an unrelated line, and stops
     * believing the report. A capability with no claim, or a detector that tags
     * nothing, behaves exactly as before.
     */
    const detectorEvidence = evidenceFor(args.analysis, cap).flatMap((d) => {
      if (!cap.claim) return d.evidence;

      const tagged = d.evidence.filter((item) => item.claim === cap.claim);
      return tagged.length > 0 ? tagged : d.evidence.filter((item) => item.claim === undefined);
    });
    const quality = evidenceQualityFor(detectorEvidence);
    const confidence = confidenceFor(status, quality);
    const severity = severityForConfidence(claimedSeverity, confidence);

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

    penalty += scorePenalty(effectiveImportance, status);
    accumulateGap(gap, effectiveImportance, status);

    if (shouldCreateFinding(effectiveImportance, status)) {
      if (args.requestedProfile === 'auto' && args.inferenceConfidence === 'low') {
        continue;
      }

      findings.push({
        id: findingId,
        title: `${cap.title} (${effectiveImportance})`,
        category: cap.category,
        status: status === 'missing' ? 'missing' : 'partial',
        severity,
        description: `${cap.description} Current status: ${status}.`,
        recommendation: cap.recommendation,
        evidence: detectorEvidence.length > 0 ? detectorEvidence : [{ type: 'note', value: 'no direct evidence captured' }],
        confidence,
        evidenceQuality: quality,
      });
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-penalty / EXPECTATION_DECAY))));

  const result: ProductExpectationResult = {
    selectedProfile: args.selectedProfile,
    inferredProfile: args.inferredProfile,
    inferenceConfidence: args.inferenceConfidence,
    profileTitle: profile.title,
    profileDescription: profile.description,
    capabilities: evaluations,
    score,
    gap,
  };

  return { result, findings };
}