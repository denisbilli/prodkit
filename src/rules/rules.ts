import { inferProductProfile } from '../expectations/inferProductProfile';
import type { DetectorEvidence } from '../analyzer/types';
import type { EvidenceQuality, Finding, FindingConfidence, FindingStatus, Severity } from '../report/types';
import type { Rule } from './types';

function statusFromFlags(present: boolean, complete?: boolean): FindingStatus {
  if (!present) return 'missing';
  if (complete === false) return 'partial';
  if (complete === true || complete === undefined) return 'passed';
  return 'unknown';
}

/**
 * `unknown` is not a severity, it is the absence of one.
 *
 * A rule that does not apply — the Django DEBUG check on an Express project, say —
 * returned `unknown` while keeping the severity it would have had if it had applied.
 * The JSON report therefore carried `severity: 'critical'` on a finding whose own
 * evidence read "Django stack not detected", and a scan of a repository with no
 * Python in it published three of them.
 *
 * Nothing shipped was misled: every consumer, in the CLI summary, the markdown report
 * and the cloud, filters `status !== 'unknown'` alongside the severity. But that pair
 * is written out in four separate places, and each one is a chance to write only half
 * of it — which anyone reading the JSON from outside this repository, through the MCP
 * server or the Action, would have no reason to know they had to do at all.
 *
 * Carrying `info` makes `severity === 'critical'` a safe question on its own. Scoring
 * is unaffected: score.ts already skips `unknown` before it looks at severity.
 */
function sevForStatus(status: FindingStatus, missing: Severity): Severity {
  return status === 'passed' || status === 'unknown' ? 'info' : missing;
}

/**
 * The evidence for one claim, out of a detector that answers several.
 *
 * `security.core` decides headers, rate limiting, CORS, DEBUG and cookie flags in one
 * pass and returns one array, which every rule derived from it used to show in full. On
 * a real Django project that made the same four `SECURE_HSTS_SECONDS` lines the cited
 * evidence for missing rate limiting, for CORS and for cookie flags — forty-four reused
 * items in one report. An independent review called it out, and it is the kind of thing
 * that costs a reader's trust in everything else on the page.
 *
 * Untagged evidence is returned when a detector tags nothing, so a detector that has not
 * been given claims behaves exactly as before.
 */
function evidenceForClaim(evidence: DetectorEvidence[] | undefined, claim: string): DetectorEvidence[] {
  if (!evidence || evidence.length === 0) return [];

  const tagged = evidence.filter((item) => item.claim === claim);
  if (tagged.length > 0) return tagged;

  return evidence.filter((item) => item.claim === undefined);
}

function detectorEvidence(evidence: DetectorEvidence[] | undefined): DetectorEvidence[] {
  return evidence && evidence.length > 0 ? evidence : [{ type: 'note', value: 'no direct evidence captured' }];
}

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

/** Severity is capped by how sure the analyzer is. See the note where it is used. */
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

function confidenceFor(status: FindingStatus, evidenceQuality: EvidenceQuality): FindingConfidence {
  if (status === 'passed' && evidenceQuality === 'strong') {
    return 'high';
  }

  if (evidenceQuality === 'strong') {
    return 'high';
  }

  if (evidenceQuality === 'medium') {
    return 'medium';
  }

  return 'low';
}

function mkFinding(args: {
  id: string;
  title: string;
  category: Finding['category'];
  status: FindingStatus;
  severity: Severity;
  description: string;
  recommendation: string;
  evidence: DetectorEvidence[];
}): Finding {
  const evidenceQuality = evidenceQualityFor(args.evidence);
  const confidence = confidenceFor(args.status, evidenceQuality);

  return {
    id: args.id,
    title: args.title,
    category: args.category,
    status: args.status,
    /**
     * The same rule the expectations follow: severity says how bad it would be if true,
     * confidence says whether it is, and a reader treats `critical` as "stop and fix
     * this". Spending that word on something the analyzer is unsure of is how a report
     * stops being believed — and it was doing it on both sides of the report, not only
     * in the expectation half.
     */
    severity: severityForConfidence(args.severity, confidence),
    description: args.description,
    recommendation: args.recommendation,
    evidence: detectorEvidence(args.evidence),
    confidence,
    evidenceQuality,
  };
}

export const rules: Rule[] = [
  {
    id: 'stack.detected',
    title: 'Application stack detected',
    category: 'stack',
    severity: 'low',
    evaluate: ({ analysis }) => {
      const hasStack =
        analysis.stack.frontend.length > 0 || analysis.stack.backend.length > 0 || analysis.stack.databases.length > 0;
      const status: FindingStatus = hasStack ? 'passed' : 'unknown';
      return mkFinding({
        id: 'stack.detected',
        title: 'Application stack fingerprint',
        category: 'stack',
        status,
        severity: sevForStatus(status, 'low'),
        description: hasStack ? 'ProdKit identified known stack signals.' : 'Stack is generic or unknown to ProdKit.',
        recommendation: hasStack
          ? 'No action required.'
          : 'Add explicit framework manifests or keep this as generic app baseline.',
        evidence: [
          ...analysis.detectors['stack.frontend']?.evidence ?? [],
          ...analysis.detectors['stack.backend']?.evidence ?? [],
          ...analysis.detectors['stack.database']?.evidence ?? [],
        ],
      });
    },
  },
  {
    id: 'env.example',
    title: '.env.example presence when env vars are read',
    category: 'env',
    severity: 'medium',
    evaluate: ({ analysis }) => {
      const det = analysis.detectors['env.config'];
      const missing = Boolean(det?.details?.missingEnvExampleWarning);
      const status: FindingStatus = missing ? 'missing' : det?.present ? 'passed' : 'unknown';
      return mkFinding({
        id: 'env.example',
        title: 'Environment template file',
        category: 'env',
        status,
        severity: sevForStatus(status, 'medium'),
        description: missing
          ? 'The project reads environment variables but no .env.example was detected.'
          : 'Environment template looks available or env usage was not detected.',
        recommendation: 'Provide a safe .env.example containing required keys and no secrets.',
        evidence: det?.evidence ?? [],
      });
    },
  },
  {
    id: 'security.weak-secret',
    title: 'Weak fallback secrets',
    category: 'security',
    severity: 'critical',
    evaluate: ({ analysis }) => {
      const jwt = analysis.detectors['env.secretFallback.jwt'];
      const session = analysis.detectors['env.secretFallback.session'];
      const app = analysis.detectors['env.secretFallback.app'];
      const apiKey = analysis.detectors['env.secretFallback.apiKey'];
      const unknown = analysis.detectors['env.secretFallback.unknown'];
      const weak = Boolean(jwt?.present || session?.present || app?.present || apiKey?.present || unknown?.present);
      const weakEvidence = [
        ...(jwt?.evidence ?? []),
        ...(session?.evidence ?? []),
        ...(app?.evidence ?? []),
        ...(apiKey?.evidence ?? []),
        ...(unknown?.evidence ?? []),
      ];
      const weakTypes = [
        jwt?.present ? 'jwt' : null,
        session?.present ? 'session' : null,
        app?.present ? 'app' : null,
        apiKey?.present ? 'apiKey' : null,
      ].filter(Boolean).join(', ');
      const status: FindingStatus = weak ? 'missing' : 'passed';
      return mkFinding({
        id: 'security.weak-secret',
        title: 'Weak/fallback secret values',
        category: 'security',
        status,
        severity: weak ? 'critical' : 'info',
        description: weak
          ? `Hardcoded fallback secrets detected (${weakTypes || 'unknown'} key context).`
          : 'No weak fallback secret patterns detected.',
        recommendation: 'Require strong secrets through environment variables with strict startup validation.',
        evidence: weakEvidence,
      });
    },
  },
  {
    id: 'security.helmet',
    title: 'Helmet security headers for Express',
    category: 'security',
    severity: 'medium',
    evaluate: ({ analysis }) => {
      const isExpress = analysis.stack.backend.includes('express');
      const det = analysis.detectors['security.core'];
      const hasHelmet = Boolean(det?.details?.helmet);
      const status: FindingStatus = !isExpress ? 'unknown' : hasHelmet ? 'passed' : 'missing';
      return mkFinding({
        id: 'security.helmet',
        title: 'Security headers middleware',
        category: 'security',
        status,
        severity: sevForStatus(status, 'medium'),
        /**
         * The description used to branch on `hasHelmet` alone, so a project that is not
         * an Express application at all — status `unknown` — still read "Helmet
         * detected." A Django repository was told that, which is a contradiction inside
         * one finding and exactly the kind of thing that costs a report its credibility.
         */
        description: !isExpress
          ? `This check is about Express middleware; the backend here is ${analysis.stack.backend.join(', ') || 'not an Express application'}.`
          : hasHelmet
            ? 'Helmet detected.'
            : 'Helmet/security headers not detected for Express app.',
        /**
         * The description already branches on whether this is an Express application;
         * the recommendation did not, so a Django project was told to install an
         * Express package. Half a fix reads as confusion, which costs the same trust as
         * being wrong.
         */
        recommendation: !isExpress
          ? 'Set security headers the way this stack does: SECURE_HSTS_SECONDS, SECURE_SSL_REDIRECT and a content security policy in Django settings, or the equivalent for your framework.'
          : 'Enable helmet() and review CSP/HSTS settings for your deployment model.',
        evidence: evidenceForClaim(det?.evidence, 'headers'),
      });
    },
  },
  {
    id: 'security.rate-limit-auth',
    title: 'Rate limit on auth surfaces',
    category: 'security',
    severity: 'medium',
    evaluate: ({ analysis }) => {
      const isExpress = analysis.stack.backend.includes('express');
      const auth = analysis.detectors['auth.core'];
      const sec = analysis.detectors['security.core'];
      const hasAuth = Boolean(auth?.present);
      const hasRate = Boolean(sec?.details?.rateLimit);
      const status: FindingStatus = !isExpress || !hasAuth ? 'unknown' : hasRate ? 'passed' : 'missing';
      return mkFinding({
        id: 'security.rate-limit-auth',
        title: 'Authentication rate limiting',
        category: 'security',
        status,
        severity: sevForStatus(status, 'medium'),
        description: hasRate ? 'Rate limiting signals detected.' : 'No auth-focused rate limiting detected.',
        recommendation: 'Apply express-rate-limit (or equivalent) to login/register/password reset endpoints.',
        /**
         * The claim is about rate limiting, so the evidence is about rate limiting.
         *
         * This used to prepend the whole auth detector's evidence, which on a Django
         * project meant `"django.contrib.auth"` from INSTALLED_APPS was cited as
         * evidence for a missing rate limit. That an application has authentication is
         * why the check applies; it is not evidence about the answer.
         */
        evidence: evidenceForClaim(sec?.evidence, 'rate-limit'),
      });
    },
  },
  {
    id: 'security.cors-origin',
    title: 'CORS with explicit origin policy',
    category: 'security',
    severity: 'high',
    evaluate: ({ analysis }) => {
      const sec = analysis.detectors['security.core'];
      const loose = Boolean(sec?.details?.corsLoose);
      const strict = Boolean(sec?.details?.corsStrict);
      const status: FindingStatus = strict ? 'passed' : loose ? 'partial' : 'unknown';
      return mkFinding({
        id: 'security.cors-origin',
        title: 'CORS origin restrictions',
        category: 'security',
        status,
        severity: status === 'partial' ? sevForStatus(status, 'high') : sevForStatus(status, 'medium'),
        description:
          status === 'passed'
            ? 'CORS appears configured with explicit origins.'
            : status === 'partial'
              ? 'CORS middleware detected without explicit origin restrictions.'
              : 'CORS configuration not detected.',
        recommendation: 'Configure allowlist origins and avoid permissive defaults in production.',
        evidence: evidenceForClaim(sec?.evidence, 'cors'),
      });
    },
  },
  {
    id: 'security.django-debug',
    title: 'Django DEBUG in production context',
    category: 'security',
    severity: 'critical',
    evaluate: ({ analysis }) => {
      const isDjango = analysis.stack.backend.includes('django');
      const sec = analysis.detectors['security.core'];
      const debugTrue = Boolean(sec?.details?.djangoDebugTrue);
      const status: FindingStatus = !isDjango ? 'unknown' : debugTrue ? 'missing' : 'passed';
      return mkFinding({
        id: 'security.django-debug',
        title: 'Django DEBUG hardening',
        category: 'security',
        status,
        severity: sevForStatus(status, 'critical'),
        description: !isDjango
          ? 'Django stack not detected.'
          : debugTrue
            ? 'Django settings contain DEBUG=True.'
            : 'No DEBUG=True signal found.',
        recommendation: 'Set DEBUG=False for non-local environments and enforce via environment variables.',
        evidence: !isDjango ? [{ type: 'note', value: 'Django stack not detected' }] : evidenceForClaim(sec?.evidence, 'django-debug'),
      });
    },
  },
  {
    id: 'security.django-secure-cookies',
    title: 'Django secure cookie settings',
    category: 'security',
    severity: 'high',
    evaluate: ({ analysis }) => {
      const isDjango = analysis.stack.backend.includes('django');
      const sec = analysis.detectors['security.core'];
      const ok = Boolean(sec?.details?.djangoSecureCookies);
      const status: FindingStatus = !isDjango ? 'unknown' : ok ? 'passed' : 'missing';
      return mkFinding({
        id: 'security.django-secure-cookies',
        title: 'Django secure cookie flags',
        category: 'security',
        status,
        severity: sevForStatus(status, 'high'),
        description: !isDjango
          ? 'Django stack not detected.'
          : ok
            ? 'Secure cookie settings appear configured.'
            : 'SESSION/CSRF secure cookie flags are weak.',
        recommendation: 'Enable SESSION_COOKIE_SECURE and CSRF_COOKIE_SECURE in production.',
        evidence: !isDjango ? [{ type: 'note', value: 'Django stack not detected' }] : evidenceForClaim(sec?.evidence, 'django-cookies'),
      });
    },
  },
  {
    id: 'uploads.public-exposure',
    title: 'Public upload exposure',
    category: 'uploads',
    severity: 'high',
    evaluate: ({ analysis }) => {
      const up = analysis.detectors['uploads.exposure'];
      const exposed = Boolean(up?.details?.publicExposure);
      const unprotectedRoutes = Number(up?.details?.unprotectedUploadRoutes ?? 0);
      const status: FindingStatus = !exposed ? up?.present ? 'passed' : 'unknown' : unprotectedRoutes > 0 ? 'missing' : 'partial';
      return mkFinding({
        id: 'uploads.public-exposure',
        title: 'Upload access control',
        category: 'uploads',
        status,
        severity: status === 'missing' ? 'high' : status === 'partial' ? 'medium' : 'info',
        description:
          status === 'missing'
            ? 'Uploads look publicly exposed without auth checks.'
            : status === 'partial'
              ? 'Uploads are exposed and some auth signals exist, review route protection.'
              : 'No obvious public upload exposure signal detected.',
        recommendation: 'Protect upload routes with authz, validate MIME/type, and prefer private object storage.',
        evidence: up?.evidence ?? [],
      });
    },
  },
  {
    id: 'auth.core',
    title: 'Authentication implementation',
    category: 'auth',
    severity: 'medium',
    evaluate: ({ analysis }) => {
      const auth = analysis.detectors['auth.core'];
      const status = statusFromFlags(Boolean(auth?.present), auth?.complete);
      return mkFinding({
        id: 'auth.core',
        title: 'Authentication baseline',
        category: 'auth',
        status,
        severity: sevForStatus(status, 'medium'),
        description: status === 'missing' ? 'No clear authentication signals detected.' : 'Authentication signals detected.',
        recommendation: 'Implement robust auth flow and secure credential handling.',
        evidence: auth?.evidence ?? [],
      });
    },
  },
  {
    id: 'authz.resource-level',
    title: 'Resource-level authorization',
    category: 'authz',
    severity: 'medium',
    evaluate: ({ analysis }) => {
      const auth = analysis.detectors['auth.core'];
      const roles = analysis.detectors['authz.roles'];
      const permissions = analysis.detectors['authz.permissions'];
      const resourceLevel = analysis.detectors['authz.resourceLevel'];
      const hasAuth = Boolean(auth?.present);
      const hasRoles = Boolean(roles?.present);
      const hasPermissions = Boolean(permissions?.present);
      const hasResourceLevel = Boolean(resourceLevel?.present);
      const status: FindingStatus = !hasAuth
        ? 'unknown'
        : hasPermissions || hasResourceLevel
          ? 'passed'
          : hasRoles
            ? 'partial'
            : 'missing';
      return mkFinding({
        id: 'authz.resource-level',
        title: 'Authorization depth',
        category: 'authz',
        status,
        severity: sevForStatus(status, 'medium'),
        description:
          status === 'passed'
            ? 'Permission-level authorization signals detected.'
            : status === 'partial'
              ? 'Only basic role checks detected.'
              : 'No resource-level authorization signals detected.',
        recommendation: 'Add policy/resource-level checks beyond coarse role gates.',
        evidence: [...(roles?.evidence ?? []), ...(permissions?.evidence ?? []), ...(resourceLevel?.evidence ?? [])],
      });
    },
  },
  {
    id: 'tenancy.b2b',
    title: 'Tenant/organization model for B2B signals',
    category: 'tenancy',
    severity: 'high',
    evaluate: ({ analysis }) => {
      const organization = analysis.detectors['tenancy.organization'];
      const membership = analysis.detectors['tenancy.membership'];
      const b2bHint = Boolean(organization?.details?.b2bHint);
      const missingTenantRisk = Boolean(organization?.details?.missingTenantRisk);
      const hasMembership = Boolean(membership?.present);
      // Tenant boundaries are a backend data-access concern: without a detected
      // backend the B2B keyword hint alone (e.g. in a frontend client) is noise.
      const backendDetected = analysis.stack.backend.length > 0;

      /**
       * And not when the product is not a business one.
       *
       * This fired on a school platform that the same report classified as a B2C app,
       * so the document said "consumer application" in one place and "B2B/SaaS signals
       * detected" in another. A reader cannot act on a report that contradicts itself,
       * and of the two statements the profile is the one built from weighted evidence.
       */
      const consumerProduct = ['b2c-app', 'client-app', 'game', 'mobile-app', 'static-site'].includes(
        String(inferProductProfile(analysis).inferredProfile),
      );

      const status: FindingStatus =
        !b2bHint || !backendDetected || consumerProduct
          ? 'unknown'
          : missingTenantRisk
            ? 'missing'
            : hasMembership
              ? 'passed'
              : 'partial';
      return mkFinding({
        id: 'tenancy.b2b',
        title: 'Tenant and organization boundaries',
        category: 'tenancy',
        status,
        severity: status === 'partial' ? sevForStatus(status, 'medium') : sevForStatus(status, 'high'),
        description: status === 'unknown'
          ? (backendDetected
            ? 'No B2B/SaaS signals detected.'
            : 'No backend detected; tenant boundaries were not evaluated.')
          : missingTenantRisk
            ? 'B2B/SaaS signals detected but no clear tenant/organization concept found.'
            : hasMembership
              ? 'Tenant organization and membership signals detected.'
              : 'Organization signals exist but membership boundaries are unclear.',
        recommendation: 'Model tenant/org membership explicitly and scope data access by tenant.',
        evidence: [...(organization?.evidence ?? []), ...(membership?.evidence ?? [])],
      });
    },
  },
  {
    id: 'gdpr.privacy',
    title: 'Privacy/GDPR controls',
    category: 'gdpr',
    severity: 'medium',
    evaluate: ({ analysis }) => {
      const auth = analysis.detectors['auth.core'];
      const consent = analysis.detectors['gdpr.consent.route'];
      const dataExport = analysis.detectors['gdpr.export.route'];
      const erasure = analysis.detectors['gdpr.erasure.route'];
      const retention = analysis.detectors['gdpr.retention.job'];
      const hasUsers = Boolean(auth?.present);
      const hasGdpr = Boolean(consent?.present || dataExport?.present || erasure?.present || retention?.present);
      const status: FindingStatus = hasUsers && !hasGdpr ? 'missing' : hasGdpr ? 'passed' : 'unknown';
      return mkFinding({
        id: 'gdpr.privacy',
        title: 'Privacy compliance signals',
        category: 'gdpr',
        status,
        severity: sevForStatus(status, 'medium'),
        description: hasUsers && !hasGdpr
          ? 'Auth/users signals found but no GDPR/privacy controls detected.'
          : 'Privacy/GDPR signals detected or not applicable from available evidence.',
        recommendation: 'Implement consent, export/erasure workflows, and retention policies.',
        evidence: [
          ...(consent?.evidence ?? []),
          ...(dataExport?.evidence ?? []),
          ...(erasure?.evidence ?? []),
          ...(retention?.evidence ?? []),
        ],
      });
    },
  },
  {
    id: 'billing.webhook-signature',
    title: 'Stripe webhook signature validation',
    category: 'billing',
    severity: 'medium',
    evaluate: ({ analysis }) => {
      const stripe = analysis.detectors['billing.stripe'];
      const webhookRoute = analysis.detectors['billing.webhook.route'];
      const rawBody = analysis.detectors['billing.webhook.rawBody'];
      const secret = analysis.detectors['billing.webhook.secret'];
      const signatureValidation = analysis.detectors['billing.webhook.signatureValidation'];
      const hasStripe = Boolean(stripe?.present);
      const hasRoute = Boolean(webhookRoute?.present);
      const hasRawBody = Boolean(rawBody?.present);
      const hasSecret = Boolean(secret?.present);
      const hasSignatureValidation = Boolean(signatureValidation?.present);

      let status: FindingStatus;
      if (!hasStripe && !hasRoute) {
        status = 'unknown';
      } else if (hasRoute && hasRawBody && hasSecret && hasSignatureValidation) {
        status = 'passed';
      } else if (hasRoute && (hasRawBody || hasSecret || hasSignatureValidation)) {
        status = 'partial';
      } else {
        status = 'missing';
      }

      return mkFinding({
        id: 'billing.webhook-signature',
        title: 'Billing webhook hardening',
        category: 'billing',
        status,
        severity: sevForStatus(status, 'medium'),
        description: status === 'passed'
          ? 'Stripe webhook route, raw body handling, secret, and signature validation detected.'
          : status === 'partial'
            ? 'Stripe webhook hardening is partially implemented (some controls detected, not all).'
            : status === 'missing'
              ? 'Stripe/webhook signals detected but no reliable webhook hardening controls found.'
              : 'Stripe/webhook integration not detected.',
        recommendation: 'Verify webhook signatures using provider SDK before processing events.',
        evidence: [
          ...(stripe?.evidence ?? []),
          ...(webhookRoute?.evidence ?? []),
          ...(rawBody?.evidence ?? []),
          ...(secret?.evidence ?? []),
          ...(signatureValidation?.evidence ?? []),
        ],
      });
    },
  },
  {
    id: 'observability.health',
    title: 'Health endpoint',
    category: 'observability',
    severity: 'low',
    evaluate: ({ analysis }) => {
      const obs = analysis.detectors['observability.core'];
      const health = Boolean(obs?.details?.healthEndpoint);
      const status: FindingStatus = health ? 'passed' : 'missing';
      return mkFinding({
        id: 'observability.health',
        title: 'Healthcheck endpoint',
        category: 'observability',
        status,
        severity: sevForStatus(status, 'low'),
        description: health ? 'Health endpoint detected.' : 'No health endpoint detected.',
        recommendation: 'Add /health or /healthz endpoint for runtime and deployment checks.',
        evidence: evidenceForClaim(obs?.evidence, 'health'),
      });
    },
  },
  {
    id: 'observability.logging',
    title: 'Structured logging',
    category: 'observability',
    severity: 'low',
    evaluate: ({ analysis }) => {
      const obs = analysis.detectors['observability.core'];
      const logs = Boolean(obs?.details?.structuredLogging);
      const status: FindingStatus = logs ? 'passed' : 'missing';
      return mkFinding({
        id: 'observability.logging',
        title: 'Structured logging readiness',
        category: 'observability',
        status,
        severity: sevForStatus(status, 'low'),
        description: logs ? 'Structured logger dependency detected.' : 'No structured logging dependency detected.',
        recommendation: 'Adopt structured logs with request correlation ids.',
        evidence: evidenceForClaim(obs?.evidence, 'logging'),
      });
    },
  },
  {
    id: 'deployment.readiness',
    title: 'Deployment artifacts and runtime readiness',
    category: 'deployment',
    severity: 'low',
    evaluate: ({ analysis }) => {
      const dep = analysis.detectors['deployment.readiness'];
      const status = statusFromFlags(Boolean(dep?.present), dep?.complete);
      return mkFinding({
        id: 'deployment.readiness',
        title: 'Deployment readiness baseline',
        category: 'deployment',
        status,
        severity: sevForStatus(status, 'low'),
        description: status === 'missing'
          ? 'No meaningful deployment artifacts or prod/runtime signals detected.'
          : 'Deployment artifacts or runtime production signals detected.',
        recommendation: 'Add production-aware config, CI workflow, and graceful shutdown handling.',
        evidence: dep?.evidence ?? [],
      });
    },
  },
  {
    id: 'docker.presence',
    title: 'Containerization artifacts',
    category: 'deployment',
    severity: 'low',
    evaluate: ({ analysis }) => {
      const docker = analysis.detectors['infra.docker'];
      const status = statusFromFlags(Boolean(docker?.present), docker?.complete);
      return mkFinding({
        id: 'docker.presence',
        title: 'Docker/Docker Compose availability',
        category: 'deployment',
        status,
        severity: sevForStatus(status, 'low'),
        description: docker?.present ? 'Docker signals found.' : 'No Docker artifacts found.',
        recommendation: 'Provide Dockerfile and healthchecks for reproducible deployments.',
        evidence: docker?.evidence ?? [],
      });
    },
  },
];
