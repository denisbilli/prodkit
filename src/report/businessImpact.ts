import type { Category, Finding } from './types';

/**
 * Translates a finding into the consequence a non-engineer would care about.
 *
 * Severity says how bad something is on an abstract scale; it does not say what
 * actually happens. "CORS is permissive, severity high" tells a founder nothing they
 * can weigh against shipping a week earlier. "Any website your users visit can read
 * their data from your API using their logged-in session" does.
 */

/** Matched against the finding id by prefix, most specific first. */
const IMPACT_BY_FINDING: ReadonlyArray<[prefix: string, impact: string]> = [
  ['expectation.auth.required', 'Anyone who finds a URL can use the product and read whatever it exposes. There is no notion of "your" data.'],
  ['expectation.auth.mfa', 'A single leaked or reused password is enough to take over an account, including accounts that can act on others.'],
  ['expectation.auth.password-reset', 'Every user who forgets a password becomes a manual support request, and manual resets become their own way in.'],
  ['expectation.auth.email-verification', 'Anyone can sign up as an address they do not control, which makes impersonation and throwaway abuse free.'],
  ['expectation.authz.roles', 'Every signed-in user can do everything any other user can, including administrative and destructive actions.'],
  ['expectation.authz.ownership', 'A normal user can read or change another user records by changing an identifier in the URL.'],
  ['expectation.tenancy.organization', 'There is nothing that owns data, so there is no way to say which customer a record belongs to.'],
  ['expectation.tenancy.isolation', 'One customer can reach another customer data. For a business product this is usually the end of the contract.'],
  ['expectation.gdpr.consent', 'Personal data is processed without a recorded lawful basis, which cannot be demonstrated to a regulator after the fact.'],
  ['expectation.gdpr.export', 'A user exercising their right to their data (GDPR article 20) cannot be served without manual database work.'],
  ['expectation.gdpr.erasure', 'A deletion request (GDPR article 17) cannot be honoured, and the obligation does not go away because the feature is missing.'],
  ['expectation.gdpr.retention', 'Personal data accumulates indefinitely, so any future breach is as large as the entire history of the product.'],
  ['expectation.billing.webhook-integrity', 'Anyone can forge a payment notification and grant themselves a paid plan, or mark an unpaid order as paid.'],
  ['expectation.billing', 'There is no way to charge, and no server-side check that a paid capability was actually paid for.'],
  ['expectation.security.headers', 'The browser is not told to defend the page, leaving ordinary injection and framing attacks available.'],
  ['expectation.security.cors', 'Another website can read your API responses using a visitor logged-in session.'],
  ['expectation.security.rate-limit', 'Credentials can be guessed in bulk and expensive endpoints can be used to run up your bill.'],
  ['expectation.uploads', 'Uploaded files can be reached, or replaced, by people who should not have them.'],
  ['expectation.observability.health', 'An outage is discovered when a user reports it, not when it starts.'],
  ['expectation.observability.logging', 'When something breaks in production there is no way to reconstruct what happened.'],
  ['expectation.audit', 'There is no record of who did what, so a disputed or malicious action cannot be investigated.'],
  ['expectation.deployment', 'Deployments are not reproducible, so recovering from a bad release depends on whoever remembers the steps.'],
  ['expectation.docker', 'Environments drift between local, CI and production, and "works on my machine" becomes unfalsifiable.'],
  ['expectation.jobs', 'Slow work runs inside the request, so users wait and failures cannot be retried.'],
  ['expectation.marketplace.multi-role', 'Supply and demand are the same kind of account, so there is nothing to restrict a seller from acting as a buyer or an admin.'],
  ['expectation.marketplace.payout', 'Money can be collected but not paid out, which is the half of a marketplace that makes it one.'],
  ['expectation.marketplace.commission', 'The platform takes no recorded cut, so revenue cannot be reconciled per transaction.'],
  ['expectation.marketplace.dispute', 'A transaction that goes wrong has no resolution path and becomes a chargeback, with the fees and the account risk that follow.'],
  ['expectation.ai.cost-control', 'A loop or an abusive user translates directly into an inference bill with no ceiling.'],
  ['expectation.ai.prompt-safety', 'User input reaches the model unchecked, which is the injection surface specific to AI products.'],
  ['security.weak-secret', 'A signing secret with a fallback default means tokens can be forged by anyone who has read the source.'],
  ['security.cors', 'Another website can read your API responses using a visitor logged-in session.'],
  ['security.helmet', 'The browser is not told to defend the page, leaving ordinary injection and framing attacks available.'],
  ['security.rate-limit', 'Credentials can be guessed in bulk and expensive endpoints can be used to run up your bill.'],
  ['uploads.public-exposure', 'Uploaded files are reachable by anyone who knows or guesses the path.'],
  ['billing.webhook', 'Payment notifications are not verified, so billing state can be changed by a forged request.'],
  ['tenancy', 'Customer data is not separated, so one customer can reach another data.'],
  ['gdpr', 'A privacy obligation is unmet, and the obligation applies whether or not the feature exists.'],
  ['observability', 'Production behaviour is not visible, so problems are found late and diagnosed slowly.'],
  ['deployment', 'Releases are not reproducible, which makes recovery depend on individual memory.'],
];

/** Fallback when no specific mapping matches, so every actionable finding says something. */
const IMPACT_BY_CATEGORY: Partial<Record<Category, string>> = {
  auth: 'Access to the product is not properly controlled.',
  authz: 'Users can act beyond what their role should allow.',
  tenancy: 'Customer data is not reliably separated.',
  gdpr: 'A privacy obligation is unmet.',
  security: 'A common attack is not defended against.',
  uploads: 'Uploaded files are not properly controlled.',
  billing: 'Revenue handling is incomplete or unverified.',
  audit: 'Sensitive actions cannot be attributed after the fact.',
  observability: 'Production behaviour is not visible.',
  jobs: 'Long-running work is not handled reliably.',
  deployment: 'Releases are not reproducible.',
  env: 'Configuration or secrets are handled unsafely.',
};

export function businessImpactFor(finding: Finding): string | undefined {
  if (finding.status === 'passed') return undefined;

  for (const [prefix, impact] of IMPACT_BY_FINDING) {
    if (finding.id.startsWith(prefix)) return impact;
  }

  return IMPACT_BY_CATEGORY[finding.category];
}

/** Attaches the business impact to every actionable finding. */
export function withBusinessImpact(findings: Finding[]): Finding[] {
  return findings.map((finding) => {
    const businessImpact = businessImpactFor(finding);
    return businessImpact ? { ...finding, businessImpact } : finding;
  });
}
