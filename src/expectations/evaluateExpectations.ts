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
      /**
       * Nothing that looks like an upload route, and the owner says there is one.
       *
       * `not_applicable` is the right answer when the requirement was inferred: a
       * project with no upload surface does not need upload protection. It is the wrong
       * answer to somebody who has stated that their product takes files — either the
       * uploads are somewhere this analyzer cannot see, or the declaration is wrong,
       * and both are worth telling them.
       */
      if (!upload?.present) return capability.declared ? 'missing' : 'not_applicable';
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

      /**
       * `error_log($e)` in a global exception handler is a real answer to "will we know
       * this happened", and a different one from Monolog with a request id. Calling it
       * missing was wrong about a PHP application that logs every exception; calling it
       * present would make the recommendation wrong. It is halfway.
       */
      if (boolDetail(obs, 'anyLogging')) return 'partial';

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

/**
 * The stable part of a finding's id, where it is not simply the capability's own.
 *
 * These names predate the capability ids and are what the remediation catalogue, the
 * hosted application and every stored report are keyed on, so they stay.
 */
const FINDING_ID_BASE: Record<string, string> = {
  'auth.baseline': 'expectation.auth',
  'security.headers': 'expectation.security.headers',
  'security.cors': 'expectation.security.cors',
  'security.rate-limit': 'expectation.security.rate-limit',
  'uploads.protection': 'expectation.uploads',
  'observability.health': 'expectation.observability.health',
  'observability.logging': 'expectation.observability.logging',
  'deployment.readiness': 'expectation.deployment',
  'deployment.docker': 'expectation.docker',
  'audit.baseline': 'expectation.audit',
  'jobs.background': 'expectation.jobs',
  'auth.api-keys': 'expectation.auth.api-keys',
};

/**
 * Nine of the twelve used to hardcode their suffix.
 *
 * `security.headers` said `.required` even where a profile asks for it as a
 * recommendation, `deployment.docker` said `.recommended` even where it is required,
 * and `auth.api-keys` produced a finding titled "(required)" at high severity whose id
 * read `expectation.auth.api-keys.recommended`. A reader sees both lines, three apart,
 * and they disagree.
 *
 * The suffix is part of the key, so it cannot simply be dropped; it can be made true.
 * `getRemediationEntry` already matches across the two suffixes — it was written for
 * exactly this — so the plan still finds its task.
 */
export function toFindingId(capability: ExpectedCapability, importance: CapabilityImportance): string {
  const base = FINDING_ID_BASE[capability.id] ?? `expectation.${capability.id}`;
  return `${base}.${importance}`;
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
  /**
   * Somebody wrote cross-origin handling, however badly: the question plainly arises.
   *
   * `search` evidence is excluded, and has to be. It records a look that came back
   * empty — "searched for cross-origin configuration: cors(, Access-Control-Allow-
   * Origin" — and the sentence saying nothing was found contains every word this looks
   * for. A server-rendered Django monolith was asked for a cross-origin policy on the
   * strength of the report's own account of not finding one. An existing test caught
   * it, which is the same trap as reading `STRIPE_LEN` out of a hash implementation:
   * a string is not the thing it names.
   */
  const sec = detector(analysis, 'security.core');
  if (sec?.evidence.some((item) => item.type !== 'search' && /cors/i.test(String(item.value)))) return true;

  // An API meant for other callers.
  if (detector(analysis, 'auth.apiKeys')?.present) return true;

  /**
   * A surface named for other callers.
   *
   * `controllers` and `routes` used to be in this list, which meant every application
   * organised the way almost every application is organised was asked for a
   * cross-origin policy. A server-rendered PHP product with `src/Controllers/` — pages
   * rendered from templates, no API — was told at high severity that cross-origin
   * access was unrestricted. The Django monolith escaped it only because Django spells
   * the same directory `views`.
   */
  if (analysis.files.source.some((file) => /(^|\/)(api|graphql|serializers?)(\/|\.)/i.test(file))) return true;

  /**
   * A backend that renders nothing is answering somebody else.
   *
   * Dropping `routes` on its own went too far: an Express server whose `routes/`
   * handlers return `res.json()` and which renders no page at all is an API, whatever
   * its directories are called. What separates it from the PHP monolith is not the
   * folder name but whether anything here produces HTML — the monolith has
   * `templates/`, and its JSON helper serves its own pages.
   *
   * So the question is asked of a backend with no views: everything it answers goes to
   * an origin that is not its own.
   */
  /**
   * Some frameworks answer this by existing.
   *
   * Reading it from the file listing alone was too fragile: a Django project whose
   * templates are not in the repository, and every minimal Django fixture, looked like
   * an API server and got asked for a cross-origin policy again. Django, Rails, Laravel
   * and the page-rendering JavaScript frameworks serve pages by construction, and a
   * bare PHP application's default output is HTML. Where one of them also exposes an
   * API, the `api/` check above has already said so.
   */
  /**
   * Streamlit, Gradio, Dash and Chainlit are here for the same reason Django is: their
   * whole purpose is to render a page. They were added to the backend catalogue in
   * 0.9.0 and not to this list, so a one-file Streamlit application was treated as an
   * API server and asked at high severity to restrict cross-origin access it does not
   * offer.
   */
  const PAGE_RENDERING = [
    'django', 'rails', 'laravel', 'symfony', 'php', 'next', 'nuxt', 'astro', 'sveltekit', 'remix',
    'streamlit', 'gradio', 'dash', 'chainlit',
  ];
  const rendersPages = analysis.stack.backend.some((framework) => PAGE_RENDERING.includes(framework))
    || analysis.files.all.some((file) =>
      /(^|\/)(templates?|views)\//i.test(file)
      || /\.(twig|blade\.php|ejs|hbs|handlebars|erb|pug|jinja2?|liquid|mustache)$/i.test(file),
    );

  return analysis.stack.backend.length > 0 && !rendersPages;
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
      ? { ...cap, importance: 'required' as CapabilityImportance, declared: true }
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

    /**
     * No upload surface in the code means the question does not arise — unless the
     * owner said it does.
     *
     * This downgrade is right for a requirement the profile inferred: asking a project
     * with no upload route to protect one is noise. It was also silently cancelling the
     * declaration, so "we have file uploads" was the one answer of the four that
     * changed nothing, and it changed nothing without saying so.
     *
     * When the owner says the product takes uploads and nothing here looks like an
     * upload route, that is worth reporting either way: either the uploads are
     * somewhere this cannot see, or the declaration is wrong. Both are things the
     * reader wants to know.
     */
    if (cap.id === 'uploads.protection' && status === 'not_applicable' && effectiveImportance === 'required' && !cap.declared) {
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
        // What the capability is worth before confidence is folded in. An expectation
        // only becomes a finding when it is unmet, so the two differ only where low
        // confidence capped the severity.
        stakes: claimedSeverity,
        /**
         * Where a requirement rests on the declaration rather than on the code, the
         * finding says so. "Upload protection is missing" reads as a defect found; if
         * nothing here even looks like an upload route, the reader needs to know the
         * claim came from their own answer, so they can correct whichever of the two is
         * wrong.
         */
        description: cap.declared && !detector(args.analysis, 'uploads.exposure')?.present && cap.id === 'uploads.protection'
          ? `${cap.description} Nothing here looks like an upload route, so this rests on your answer that the product accepts files: either they are handled somewhere this cannot see, or the answer is wrong. Current status: ${status}.`
          : `${cap.description} Current status: ${status}.`,
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