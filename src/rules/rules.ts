import type { DetectorEvidence } from '../analyzer/types';
import type { Finding, FindingStatus, Severity } from '../report/types';
import type { Rule } from './types';

function statusFromFlags(present: boolean, complete?: boolean): FindingStatus {
  if (!present) return 'missing';
  if (complete === false) return 'partial';
  if (complete === true || complete === undefined) return 'passed';
  return 'unknown';
}

function sevForStatus(status: FindingStatus, missing: Severity): Severity {
  return status === 'passed' ? 'info' : missing;
}

function detectorEvidence(evidence: DetectorEvidence[] | undefined): DetectorEvidence[] {
  return evidence && evidence.length > 0 ? evidence : [{ type: 'note', value: 'no direct evidence captured' }];
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
  return {
    id: args.id,
    title: args.title,
    category: args.category,
    status: args.status,
    severity: args.severity,
    description: args.description,
    recommendation: args.recommendation,
    evidence: detectorEvidence(args.evidence),
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
        severity: status === 'passed' ? 'info' : 'low',
        description: hasStack ? 'ProdKit identified known stack signals.' : 'Stack is generic/unknown for this MVP.',
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
        severity: status === 'passed' ? 'info' : 'medium',
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
      const det = analysis.detectors['env.config'];
      const weak = Boolean(det?.details?.weakSecretFallback);
      const status: FindingStatus = weak ? 'missing' : 'passed';
      return mkFinding({
        id: 'security.weak-secret',
        title: 'Weak/fallback secret values',
        category: 'security',
        status,
        severity: weak ? 'critical' : 'info',
        description: weak
          ? 'Hardcoded fallback secrets detected (e.g. changeme/secret).' : 'No weak fallback secret patterns detected.',
        recommendation: 'Require strong secrets through environment variables with strict startup validation.',
        evidence: det?.evidence ?? [],
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
        description: hasHelmet ? 'Helmet detected.' : 'Helmet/security headers not detected for Express app.',
        recommendation: 'Enable helmet() and review CSP/HSTS settings for your deployment model.',
        evidence: det?.evidence ?? [],
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
        evidence: [...(auth?.evidence ?? []), ...(sec?.evidence ?? [])],
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
        severity: status === 'passed' ? 'info' : status === 'partial' ? 'high' : 'medium',
        description:
          status === 'passed'
            ? 'CORS appears configured with explicit origins.'
            : status === 'partial'
              ? 'CORS middleware detected without explicit origin restrictions.'
              : 'CORS configuration not detected.',
        recommendation: 'Configure allowlist origins and avoid permissive defaults in production.',
        evidence: sec?.evidence ?? [],
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
        severity: status === 'passed' ? 'info' : 'critical',
        description: debugTrue ? 'Django settings contain DEBUG=True.' : 'No DEBUG=True signal found.',
        recommendation: 'Set DEBUG=False for non-local environments and enforce via environment variables.',
        evidence: sec?.evidence ?? [],
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
        description: ok ? 'Secure cookie settings appear configured.' : 'SESSION/CSRF secure cookie flags are weak.',
        recommendation: 'Enable SESSION_COOKIE_SECURE and CSRF_COOKIE_SECURE in production.',
        evidence: sec?.evidence ?? [],
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
        severity: status === 'passed' ? 'info' : 'medium',
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
      const status: FindingStatus = !b2bHint ? 'unknown' : missingTenantRisk ? 'missing' : hasMembership ? 'passed' : 'partial';
      return mkFinding({
        id: 'tenancy.b2b',
        title: 'Tenant and organization boundaries',
        category: 'tenancy',
        status,
        severity: status === 'passed' ? 'info' : status === 'partial' ? 'medium' : 'high',
        description: missingTenantRisk
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
      const billing = analysis.detectors['billing.stripe'];
      const stripe = Boolean(billing?.details?.stripe);
      const hasWebhook = Boolean(billing?.details?.hasWebhook);
      const hasWebhookSecret = Boolean(billing?.details?.hasWebhookSecret);
      const sig = Boolean(billing?.details?.webhookSignatureValidation);
      const status: FindingStatus = !stripe ? 'unknown' : sig ? 'passed' : hasWebhook && !hasWebhookSecret ? 'partial' : 'missing';
      return mkFinding({
        id: 'billing.webhook-signature',
        title: 'Billing webhook hardening',
        category: 'billing',
        status,
        severity: sevForStatus(status, 'medium'),
        description: stripe && !sig
          ? hasWebhook && !hasWebhookSecret
            ? 'Stripe webhook route found but webhook secret/signature handling looks incomplete.'
            : 'Stripe integration appears present but webhook signature validation was not detected.'
          : 'Stripe webhook signature validation detected or billing not present.',
        recommendation: 'Verify webhook signatures using provider SDK before processing events.',
        evidence: billing?.evidence ?? [],
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
        evidence: obs?.evidence ?? [],
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
        evidence: obs?.evidence ?? [],
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
