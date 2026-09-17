import type {
  CapabilityImportance,
  ExpectedCapability,
  ProductProfile,
  ProductProfileDefinition,
} from './types';

/**
 * A capability without its importance. Importance is not a property of the
 * capability itself — it is what each product profile decides about it, and it is
 * the only thing that differs between profiles for a shared capability.
 */
type CapabilityBlueprint = Omit<ExpectedCapability, 'importance'>;

function blueprint(args: CapabilityBlueprint): CapabilityBlueprint {
  return args;
}

/**
 * The capability catalogue.
 *
 * Capabilities are deliberately fine-grained: a single `gdpr.baseline` could only
 * ever be "mostly missing" for every profile, which told the user nothing about
 * which profile they should care about. Splitting it into consent/export/erasure/
 * retention lets a B2C app demand consent while an internal tool does not.
 *
 * Every id here must have a case in `deriveStatus` in evaluateExpectations.ts,
 * otherwise it falls back to generic detectorKeys matching.
 */
const CAPABILITIES = {
  'auth.baseline': blueprint({
    id: 'auth.baseline',
    title: 'Authentication baseline',
    category: 'auth',
    detectorKeys: ['auth.core'],
    description: 'Authenticated users and explicit auth flow controls.',
    recommendation: 'Implement an authentication flow and protect user-facing routes.',
  }),
  'auth.mfa': blueprint({
    id: 'auth.mfa',
    title: 'Multi-factor authentication',
    category: 'auth',
    detectorKeys: ['auth.2fa'],
    description: 'A second authentication factor for accounts that control money, data or other users.',
    recommendation: 'Offer TOTP or WebAuthn as a second factor, at least for admin and owner roles.',
  }),
  'auth.password-reset': blueprint({
    id: 'auth.password-reset',
    title: 'Password reset flow',
    category: 'auth',
    detectorKeys: ['auth.passwordReset'],
    description: 'Self-service account recovery. Without it every locked-out user becomes a support ticket.',
    recommendation: 'Add a token-based password reset with expiry and single use.',
  }),
  'auth.email-verification': blueprint({
    id: 'auth.email-verification',
    title: 'Email verification',
    category: 'auth',
    detectorKeys: ['auth.emailVerification'],
    description: 'Proof that a signup controls the address it claims, which gates abuse and impersonation.',
    recommendation: 'Verify the address before granting full account capabilities.',
  }),
  'auth.api-keys': blueprint({
    id: 'auth.api-keys',
    title: 'API key support for service access',
    category: 'auth',
    detectorKeys: ['auth.apiKeys'],
    description: 'Programmatic access separate from interactive user sessions.',
    recommendation: 'Add API key issuance, validation, rotation, and scope policies.',
  }),
  'authz.roles': blueprint({
    id: 'authz.roles',
    title: 'Role model',
    category: 'authz',
    detectorKeys: ['authz.roles', 'authz.permissions'],
    description: 'Distinct roles so that not every authenticated user can do everything.',
    recommendation: 'Model roles or permissions explicitly and check them on privileged actions.',
  }),
  'authz.ownership': blueprint({
    id: 'authz.ownership',
    title: 'Resource ownership checks',
    category: 'authz',
    detectorKeys: ['authz.resourceLevel'],
    description: 'Per-record checks that a caller may act on the specific resource, not just the route.',
    recommendation: 'Add ownership checks on read, update and delete to prevent IDOR-style access.',
  }),
  'tenancy.organization': blueprint({
    id: 'tenancy.organization',
    title: 'Organization model',
    category: 'tenancy',
    detectorKeys: ['tenancy.organization'],
    description: 'An explicit organization or workspace entity that owns data.',
    recommendation: 'Model organization as a first-class entity that owns projects and records.',
  }),
  'tenancy.isolation': blueprint({
    id: 'tenancy.isolation',
    title: 'Tenant data isolation',
    category: 'tenancy',
    detectorKeys: ['tenancy.membership'],
    description: 'Membership and scoping so one tenant cannot read another tenant rows.',
    recommendation: 'Scope every query by tenant context and enforce membership on access.',
  }),
  'gdpr.consent': blueprint({
    id: 'gdpr.consent',
    title: 'Consent capture',
    category: 'gdpr',
    detectorKeys: ['gdpr.consent.route'],
    description:
      'A recorded lawful basis for processing personal data. Consent is one of the six in Article 6, and often not the relevant one: a product processing its customer\'s data to deliver a contract relies on that contract, not on consent. What nearly every web product does need consent for is tracking and analytics, which is a separate duty under ePrivacy.',
    recommendation:
      'Record the lawful basis you rely on. Where that basis is consent — tracking, analytics, marketing — capture and store it with a timestamp and the version of the terms.',
  }),
  'gdpr.export': blueprint({
    id: 'gdpr.export',
    title: 'Data export (portability)',
    category: 'gdpr',
    detectorKeys: ['gdpr.export.route'],
    description: 'A way for a user to obtain their personal data, required by GDPR article 20.',
    recommendation: 'Add an export endpoint producing a machine-readable archive of user data.',
  }),
  'gdpr.erasure': blueprint({
    id: 'gdpr.erasure',
    title: 'Data erasure (right to be forgotten)',
    category: 'gdpr',
    detectorKeys: ['gdpr.erasure.route'],
    description: 'A way to delete a user and their personal data, required by GDPR article 17.',
    recommendation: 'Add an erasure flow that removes or anonymises personal data across stores.',
  }),
  'gdpr.retention': blueprint({
    id: 'gdpr.retention',
    title: 'Retention limits',
    category: 'gdpr',
    detectorKeys: ['gdpr.retention.job'],
    description: 'Personal data is not kept indefinitely by default.',
    recommendation: 'Define retention windows and run a job that enforces them.',
  }),
  'billing.model': blueprint({
    id: 'billing.model',
    title: 'Billing and subscription model',
    category: 'billing',
    detectorKeys: ['billing.stripe'],
    description: 'A way to charge for the product and to gate features by entitlement.',
    recommendation: 'Introduce a plan/subscription model with server-side entitlement checks.',
  }),
  'billing.webhook-integrity': blueprint({
    id: 'billing.webhook-integrity',
    title: 'Payment webhook integrity',
    category: 'billing',
    detectorKeys: [
      'billing.webhook.route',
      'billing.webhook.signatureValidation',
      'billing.webhook.rawBody',
      'billing.webhook.secret',
    ],
    description: 'Payment webhooks are verified, so a forged request cannot grant a paid plan for free.',
    recommendation: 'Verify the provider signature against the raw request body using a secret from configuration.',
  }),
  'security.headers': blueprint({
    id: 'security.headers',
    title: 'Security headers middleware',
    category: 'security',
    detectorKeys: ['security.core'],
    description: 'Browser-facing responses carry hardening headers.',
    recommendation: 'Mount helmet (or equivalent) and review CSP and HSTS settings.',
  }),
  'security.cors': blueprint({
    id: 'security.cors',
    title: 'CORS origin restrictions',
    category: 'security',
    detectorKeys: ['security.core'],
    description: 'Cross-origin access is limited to known origins.',
    recommendation: 'Use an explicit allowlist from configuration and reject unknown origins.',
  }),
  'security.rate-limit': blueprint({
    id: 'security.rate-limit',
    title: 'Rate limiting on risk surfaces',
    category: 'security',
    detectorKeys: ['security.core'],
    description: 'Throttling on authentication and other abusable endpoints.',
    recommendation: 'Apply route-specific rate limits to auth and sensitive endpoints.',
  }),
  'uploads.protection': blueprint({
    id: 'uploads.protection',
    title: 'Upload route protection',
    category: 'uploads',
    detectorKeys: ['uploads.exposure'],
    description: 'Where uploads exist, they are authenticated and validated.',
    recommendation: 'Protect upload routes and enforce validation for file size and type.',
  }),
  'observability.health': blueprint({
    id: 'observability.health',
    title: 'Health endpoint',
    category: 'observability',
    detectorKeys: ['observability.core'],
    description: 'A health endpoint for orchestration and uptime checks.',
    recommendation: 'Add a /health or /healthz endpoint.',
  }),
  'observability.logging': blueprint({
    id: 'observability.logging',
    title: 'Structured logging',
    category: 'observability',
    detectorKeys: ['observability.core'],
    description: 'Structured logs with request correlation, so production incidents are diagnosable.',
    recommendation: 'Adopt a structured logger and propagate request correlation ids.',
  }),
  'audit.baseline': blueprint({
    id: 'audit.baseline',
    title: 'Audit logging for sensitive actions',
    category: 'audit',
    detectorKeys: ['observability.core', 'auth.core', 'billing.stripe'],
    description: 'Sensitive actions are attributable for support, compliance and investigations.',
    recommendation: 'Log actor, action, target, timestamp and request id for sensitive events.',
  }),
  'app.state-durability': blueprint({
    id: 'app.state-durability',
    title: 'Player progress survives the browser',
    category: 'client',
    detectorKeys: ['app.stateDurability'],
    description:
      'Progress is kept somewhere durable rather than only in browser storage, which is emptied by a cleared cache, a private window or a new device — without the player ever being told the save was not real.',
    recommendation: 'Persist progress server-side, and treat browser storage as a cache of it rather than as the record.',
  }),
  'app.asset-delivery': blueprint({
    id: 'app.asset-delivery',
    title: 'Assets are cached',
    category: 'client',
    detectorKeys: ['app.assetDelivery'],
    description:
      'Sprites, audio and models are most of what a player downloads. Served without cache headers they are fetched again on every visit, which is the difference between a game that starts and one abandoned while it loads.',
    recommendation: 'Serve static assets with long-lived cache headers and fingerprinted filenames, or put a CDN in front of them.',
  }),
  'client.error-reporting': blueprint({
    id: 'client.error-reporting',
    title: 'Crashes reach someone who can fix them',
    category: 'client',
    detectorKeys: ['observability.errorReporting'],
    description:
      'On a server a crash is in the logs whether anyone planned for it or not. In code running on someone else\'s device it is not: the screen goes white, the person closes the tab, and nothing records that it happened.',
    recommendation: 'Report unhandled errors and rejections from the browser to a service you actually read.',
  }),
  'jobs.background': blueprint({
    id: 'jobs.background',
    title: 'Background jobs or queue processing',
    category: 'jobs',
    detectorKeys: ['jobs.background'],
    description: 'Long or retriable work runs outside the request cycle.',
    recommendation: 'Introduce a queue or job runner for non-blocking and retriable workloads.',
  }),
  'deployment.readiness': blueprint({
    id: 'deployment.readiness',
    title: 'Deployment readiness',
    category: 'deployment',
    detectorKeys: ['deployment.readiness'],
    description: 'Reproducible deployment and production-aware runtime settings.',
    recommendation: 'Add deploy artifacts, graceful shutdown, and production runtime configuration.',
  }),
  'deployment.docker': blueprint({
    id: 'deployment.docker',
    title: 'Container packaging',
    category: 'deployment',
    detectorKeys: ['infra.docker'],
    description: 'Container packaging for local, CI and production parity.',
    recommendation: 'Add a Dockerfile, and optionally Compose for local and CI parity.',
  }),
  'marketplace.multi-role': blueprint({
    id: 'marketplace.multi-role',
    title: 'Distinct buyer and seller roles',
    category: 'authz',
    detectorKeys: ['marketplace.multiRole'],
    description: 'Two structurally different parties, not one generic user type with a flag.',
    recommendation: 'Model the supply side and the demand side as distinct roles with their own permissions and onboarding.',
  }),
  'marketplace.payout': blueprint({
    id: 'marketplace.payout',
    title: 'Payouts to third parties',
    category: 'billing',
    detectorKeys: ['marketplace.payout'],
    description: 'Money reaching the supply side. A marketplace that can only collect is a shop.',
    recommendation: 'Use a connected-account model (Stripe Connect or equivalent) and reconcile payouts.',
  }),
  'marketplace.commission': blueprint({
    id: 'marketplace.commission',
    title: 'Commission or platform fee',
    category: 'billing',
    detectorKeys: ['marketplace.commission'],
    description: 'The cut the platform takes, which is how a marketplace earns.',
    recommendation: 'Make the fee explicit in the payment flow and record it per transaction.',
  }),
  'marketplace.dispute': blueprint({
    id: 'marketplace.dispute',
    title: 'Dispute and refund handling',
    category: 'billing',
    detectorKeys: ['marketplace.dispute'],
    description: 'A way to unwind a transaction that went wrong, before it becomes a chargeback.',
    recommendation: 'Add refund and dispute flows with an audit trail and a defined resolution path.',
  }),
  'ai.cost-control': blueprint({
    id: 'ai.cost-control',
    title: 'Inference cost controls',
    category: 'billing',
    detectorKeys: ['ai.costControl'],
    description: 'Quotas or credits bounding model spend. Inference costs money per call, so a loop or an abusive user turns directly into a bill.',
    recommendation: 'Enforce per-user quotas or credits, cap token budgets, and alert on spend.',
  }),
  'ai.prompt-safety': blueprint({
    id: 'ai.prompt-safety',
    title: 'Model input validation',
    category: 'security',
    detectorKeys: ['ai.promptSafety'],
    description: 'Validation between user input and the model, which is the injection surface specific to AI products.',
    recommendation: 'Validate and constrain user input before it reaches a prompt, and separate system instructions from user content.',
  }),
  'b2c.onboarding': blueprint({
    id: 'b2c.onboarding',
    title: 'Signup and onboarding flow',
    category: 'auth',
    detectorKeys: ['onboarding.flow'],
    description: 'A path from stranger to first use. A consumer product with no onboarding loses the user before it has one.',
    recommendation: 'Add an explicit signup and first-run flow, with a defined activation step.',
  }),
  'b2c.notifications': blueprint({
    id: 'b2c.notifications',
    title: 'Transactional notifications',
    category: 'observability',
    detectorKeys: ['notifications.transactional'],
    description: 'A way to reach the user after they leave: confirmations, resets, and account notices.',
    recommendation: 'Wire a transactional email or push provider and cover the account lifecycle events.',
  }),
} as const;

export type CapabilityId = keyof typeof CAPABILITIES;

type ImportanceTable = Partial<Record<CapabilityId, CapabilityImportance>>;

/**
 * Builds a profile from an explicit importance table. Capabilities left out of the
 * table are simply not part of the profile, which keeps each profile readable as a
 * single list of what it actually expects.
 */
function defineProfile(args: {
  id: Exclude<ProductProfile, 'auto' | 'observed-only'>;
  title: string;
  description: string;
  importance: ImportanceTable;
}): ProductProfileDefinition {
  const capabilities: ExpectedCapability[] = Object.entries(args.importance).map(
    ([id, importance]) => ({
      ...CAPABILITIES[id as CapabilityId],
      importance: importance as CapabilityImportance,
    }),
  );

  return {
    id: args.id,
    title: args.title,
    description: args.description,
    capabilities,
  };
}

export const productProfiles: Record<
  Exclude<ProductProfile, 'auto' | 'observed-only'>,
  ProductProfileDefinition
> = {
  'static-site': defineProfile({
    id: 'static-site',
    title: 'Static Site',
    description: 'Static or primarily frontend site with minimal backend requirements.',
    importance: {
      'gdpr.consent': 'optional',
      'security.headers': 'recommended',
      'security.cors': 'optional',
      'observability.health': 'optional',
      'deployment.readiness': 'recommended',
      'deployment.docker': 'optional',
    },
  }),

  'internal-tool': defineProfile({
    id: 'internal-tool',
    title: 'Internal Tool',
    description: 'Operational tool for internal users with moderate security and operability expectations.',
    importance: {
      'auth.baseline': 'required',
      'auth.mfa': 'optional',
      'auth.password-reset': 'recommended',
      'authz.roles': 'recommended',
      'authz.ownership': 'recommended',
      'tenancy.organization': 'optional',
      'gdpr.consent': 'optional',
      'gdpr.export': 'optional',
      'gdpr.erasure': 'optional',
      'security.headers': 'recommended',
      'security.cors': 'recommended',
      'security.rate-limit': 'optional',
      'uploads.protection': 'recommended',
      'observability.health': 'recommended',
      'observability.logging': 'recommended',
      'audit.baseline': 'recommended',
      'deployment.readiness': 'recommended',
      'deployment.docker': 'recommended',
    },
  }),

  /**
   * A game is the clearest case for what this product exists to do: judge a repository
   * by what its kind of product needs. Almost everything a B2B SaaS is held to is
   * irrelevant here — there are no tenants to isolate, no audit trail anyone will ever
   * read, no organisation model — and marking a game down for missing them says
   * nothing true about whether it is ready for players.
   *
   * What replaces them is specific: progress that survives, and assets that arrive.
   * Accounts and their privacy duties stay optional, because plenty of games have no
   * accounts at all — and become required through the capabilities themselves once
   * auth is detected.
   */
  game: defineProfile({
    id: 'game',
    title: 'Game',
    description: 'A game served to players, judged on whether progress survives and assets arrive.',
    importance: {
      'app.state-durability': 'required',
      'app.asset-delivery': 'required',
      'client.error-reporting': 'recommended',
      'auth.baseline': 'optional',
      'auth.password-reset': 'optional',
      'gdpr.export': 'optional',
      'gdpr.erasure': 'optional',
      'security.headers': 'recommended',
      'security.cors': 'recommended',
      // Multiplayer is abuse-exposed in a way a single-player game is not, and a
      // rate limit is the cheapest thing standing between a lobby and a script.
      'security.rate-limit': 'recommended',
      'uploads.protection': 'optional',
      'observability.health': 'recommended',
      'observability.logging': 'recommended',
      'deployment.readiness': 'required',
      'deployment.docker': 'recommended',
    },
  }),

  /**
   * An application someone uses to do something, without accounts to manage or
   * subscriptions to sell.
   *
   * Two shapes, one profile. A simulator or an editor with all its logic in the browser
   * and no backend at all; and a tool with a backend and an API but no sign-up and
   * nothing to bill. The expectations are the same in both — the user's work survives,
   * the bundle arrives, a crash is heard about — and the presence of a backend changes
   * which of them apply, not which of them matter.
   *
   * What it deliberately does not ask for: tenants to separate, an audit trail, consent
   * to collect. Holding a fuel-price finder to those produces findings nobody can act
   * on, which is the failure this profile exists to stop.
   */
  'client-app': defineProfile({
    id: 'client-app',
    title: 'Client application',
    description: 'A tool people use, without accounts to manage or subscriptions to sell.',
    importance: {
      'app.state-durability': 'required',
      'app.asset-delivery': 'required',
      'client.error-reporting': 'required',
      'auth.baseline': 'optional',
      'gdpr.export': 'optional',
      'gdpr.erasure': 'optional',
      'security.headers': 'recommended',
      'security.cors': 'recommended',
      'security.rate-limit': 'recommended',
      'uploads.protection': 'optional',
      'observability.health': 'optional',
      'observability.logging': 'recommended',
      'deployment.readiness': 'required',
      'deployment.docker': 'recommended',
    },
  }),

  'b2c-app': defineProfile({
    id: 'b2c-app',
    title: 'B2C App',
    description: 'Consumer-facing app with user accounts, privacy duties and abuse exposure.',
    importance: {
      'auth.baseline': 'required',
      'auth.mfa': 'optional',
      'auth.password-reset': 'required',
      'auth.email-verification': 'required',
      'b2c.onboarding': 'required',
      'b2c.notifications': 'required',
      'authz.ownership': 'recommended',
      'gdpr.consent': 'required',
      'gdpr.export': 'required',
      'gdpr.erasure': 'required',
      'gdpr.retention': 'recommended',
      'billing.model': 'optional',
      'billing.webhook-integrity': 'optional',
      'security.headers': 'required',
      'security.cors': 'required',
      'security.rate-limit': 'required',
      'uploads.protection': 'required',
      'observability.health': 'recommended',
      'observability.logging': 'recommended',
      'audit.baseline': 'optional',
      'deployment.readiness': 'required',
      'deployment.docker': 'recommended',
    },
  }),

  'b2b-saas': defineProfile({
    id: 'b2b-saas',
    title: 'B2B SaaS',
    description: 'Business SaaS with tenancy, authorization depth, privacy duties and operability expectations.',
    importance: {
      'auth.baseline': 'required',
      'auth.mfa': 'recommended',
      'auth.password-reset': 'required',
      'auth.email-verification': 'recommended',
      'auth.api-keys': 'recommended',
      'authz.roles': 'required',
      'authz.ownership': 'required',
      'tenancy.organization': 'required',
      'tenancy.isolation': 'required',
      // Recommended, not required. A B2B SaaS processing its customer's data to
      // deliver a contract relies on that contract as its lawful basis, not on
      // consent — so demanding a consent mechanism asks for something the law does
      // not, and that most such products deliberately do not build. What usually does
      // apply is tracking consent, which is why this stays on the list at all.
      'gdpr.consent': 'recommended',
      'gdpr.export': 'required',
      'gdpr.erasure': 'required',
      'gdpr.retention': 'recommended',
      'billing.model': 'recommended',
      'billing.webhook-integrity': 'recommended',
      'security.headers': 'required',
      'security.cors': 'required',
      'security.rate-limit': 'required',
      'uploads.protection': 'required',
      'observability.health': 'required',
      'observability.logging': 'recommended',
      'audit.baseline': 'recommended',
      'deployment.readiness': 'required',
      'deployment.docker': 'recommended',
    },
  }),

  'ai-saas': defineProfile({
    id: 'ai-saas',
    title: 'AI SaaS',
    description: 'AI-powered SaaS with async workloads, upload safety, cost exposure and high observability needs.',
    importance: {
      'auth.baseline': 'required',
      'auth.mfa': 'recommended',
      'auth.password-reset': 'required',
      'auth.email-verification': 'recommended',
      'auth.api-keys': 'required',
      'authz.roles': 'required',
      'authz.ownership': 'required',
      'tenancy.organization': 'required',
      'tenancy.isolation': 'required',
      'gdpr.consent': 'required',
      'gdpr.export': 'required',
      'gdpr.erasure': 'required',
      'gdpr.retention': 'required',
      'billing.model': 'required',
      'billing.webhook-integrity': 'required',
      'security.headers': 'required',
      'security.cors': 'required',
      'security.rate-limit': 'required',
      'uploads.protection': 'required',
      'observability.health': 'required',
      'observability.logging': 'required',
      'audit.baseline': 'required',
      // Recommended. Inference that takes minutes needs a queue; inference that
      // answers in the request does not, and a great many AI products are the second
      // kind. Requiring it marked down every synchronous one.
      'jobs.background': 'recommended',
      'ai.cost-control': 'required',
      'ai.prompt-safety': 'required',
      'deployment.readiness': 'required',
      'deployment.docker': 'recommended',
    },
  }),

  marketplace: defineProfile({
    id: 'marketplace',
    title: 'Marketplace',
    description: 'Two-sided product where distinct parties transact, requiring role separation, payment integrity and dispute handling.',
    importance: {
      'auth.baseline': 'required',
      'auth.mfa': 'required',
      'auth.password-reset': 'required',
      'auth.email-verification': 'required',
      'authz.roles': 'required',
      'authz.ownership': 'required',
      'b2c.notifications': 'recommended',
      'marketplace.multi-role': 'required',
      'marketplace.payout': 'required',
      'marketplace.commission': 'required',
      'marketplace.dispute': 'required',
      // Required, to match tenancy.isolation. Isolation of parties you have not
      // modelled is not a weaker version of the control; it is not the control.
      'tenancy.organization': 'required',
      'tenancy.isolation': 'required',
      'gdpr.consent': 'required',
      'gdpr.export': 'required',
      'gdpr.erasure': 'required',
      'gdpr.retention': 'recommended',
      'billing.model': 'required',
      'billing.webhook-integrity': 'required',
      'security.headers': 'required',
      'security.cors': 'required',
      'security.rate-limit': 'required',
      'uploads.protection': 'required',
      'observability.health': 'required',
      'observability.logging': 'required',
      'audit.baseline': 'required',
      'deployment.readiness': 'required',
      'deployment.docker': 'recommended',
    },
  }),
};

export function getProductProfile(
  profile: Exclude<ProductProfile, 'auto' | 'observed-only'>,
): ProductProfileDefinition {
  return productProfiles[profile];
}
