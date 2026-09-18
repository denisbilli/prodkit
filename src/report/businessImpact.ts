import type { Finding } from './types';

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
  /**
   * The profiles that are not a web application.
   *
   * This table was written for server products and never grew when `client-app`,
   * `mobile-app` and `library` arrived, so a hundred and twenty-six actionable findings
   * across the verification corpus said nothing at all here — every one of them in a
   * product that is not a web application, which is the case this tool exists to judge
   * on its own terms.
   */
  ['expectation.app.state-durability', 'Work the person has done lives only in storage the platform may clear, so a cleared cache, a private window or a reinstall loses it silently.'],
  ['expectation.app.asset-delivery', 'The first screen waits on the network every time, and on a bad connection the product looks broken rather than slow.'],
  ['expectation.client.error-reporting', 'A crash on somebody else device is invisible: the screen goes white, the person leaves, and nothing reaches anybody who could fix it.'],
  ['expectation.mobile.offline', 'A network that comes and goes is the normal state of a phone, so the product spends part of every day showing a spinner in a lift or on a train.'],
  ['expectation.mobile.credential-storage', 'A token in preferences or a plain file is readable on a rooted device and often travels into a backup, which is where it leaks from.'],
  ['expectation.mobile.permissions', 'A permission asked with no reason attached is refused more often, and on iOS a missing purpose string is a review rejection rather than a warning.'],
  ['expectation.mobile.forced-update', 'A version installed months ago keeps talking to the server whatever the release notes say, so a broken client cannot be retired.'],
  ['expectation.mobile.privacy-declaration', 'What the store listing promises about data lives in a dashboard rather than beside the code, so it stops matching what the app collects and nobody notices.'],
  ['expectation.packaging.license', 'Without a licence nobody may legally use the package, and a company that checks will refuse it at the dependency review.'],
  ['expectation.packaging.entrypoints', 'Whoever installs the package cannot import it: what is published has no stated way in.'],
  ['expectation.packaging.metadata', 'The registry cannot say what this is or who maintains it, so the package is hard to find and harder to trust.'],
  ['expectation.docs.readme', 'Somebody who finds the package has nothing telling them what it does, so they move on.'],
  ['expectation.quality.tests', 'Nothing proves the package works, so every release is a guess and every regression is found by a user.'],
  ['expectation.quality.ci', 'The tests run when somebody remembers, which over a few months means they stop running.'],
  ['expectation.b2c.notifications', 'There is no way to reach somebody after they close the tab: no confirmation, no password reset, no notice that something happened to their account.'],
  ['expectation.b2c.onboarding', 'A new account lands on an empty product with nothing to do first, which is where most of them stop.'],
  ['expectation.auth.api-keys', 'Machine access has to borrow a human session, so a script that stops working is indistinguishable from somebody signing out — and a leaked key cannot be revoked on its own.'],
  ['auth.core', 'Anyone who finds a URL can use the product and read whatever it exposes. There is no notion of "your" data.'],
  ['authz.resource-level', 'A normal user can read or change another user records by changing an identifier in the URL.'],
  ['docker.presence', 'Environments drift between local, CI and production, and "works on my machine" becomes unfalsifiable.'],
  ['env.example', 'Somebody setting the project up has to read the source to find out which variables it needs, and a missing one fails at runtime rather than at startup.'],
  ['security.django-debug', 'With DEBUG on, an error page shows the stack, the settings and often the database contents to whoever triggered it.'],
  ['security.django-secure-cookies', 'Session and CSRF cookies travel in the clear, so anybody on the same network can take a signed-in session.'],
  ['tenancy', 'Customer data is not separated, so one customer can reach another data.'],
  ['gdpr', 'A privacy obligation is unmet, and the obligation applies whether or not the feature exists.'],
  ['observability', 'Production behaviour is not visible, so problems are found late and diagnosed slowly.'],
  ['deployment', 'Releases are not reproducible, which makes recovery depend on individual memory.'],
];

/**
 * There is no fallback, and that is the point.
 *
 * There was one, and it said things like "a common attack is not defended against" and
 * "a privacy obligation is unmet" — the finding's own title with the detail removed.
 * A hundred and two actionable findings in the verification corpus carried one of those
 * twelve sentences, under a heading that promises what actually happens.
 *
 * Saying nothing is better: the finding, its evidence and its recommendation are still
 * there, and a reader is not handed a sentence that adds a line and no information. A
 * test keeps the list honest by failing when a finding the fixtures produce has no
 * specific sentence.
 */

export function businessImpactFor(finding: Finding): string | undefined {
  if (finding.status === 'passed') return undefined;

  for (const [prefix, impact] of IMPACT_BY_FINDING) {
    if (finding.id.startsWith(prefix)) return impact;
  }

  return undefined;
}

/** Attaches the business impact to every actionable finding. */
/**
 * These sentences describe a consequence of something being wrong.
 *
 * Attached to every finding regardless of status, they contradicted the finding they
 * sat under. A Django project was told, three lines apart, that the security-headers
 * check is about Express middleware and does not apply — and then that "the browser is
 * not told to defend the page, leaving ordinary injection and framing attacks
 * available". An upload check that found nothing exposed still announced that
 * "uploaded files are reachable by anyone who knows or guesses the path".
 *
 * A reader cannot tell a confused report from a wrong one, and stops trusting both.
 */
function describesADefect(finding: Finding): boolean {
  return finding.status === 'missing' || finding.status === 'partial';
}

export function withBusinessImpact(findings: Finding[]): Finding[] {
  return findings.map((finding) => {
    if (!describesADefect(finding)) {
      /**
       * A check that passed has nothing to recommend.
       *
       * Every one of the thirty passed checks across four real reports carried an
       * instruction to add what the project already has — "add production-aware config,
       * CI workflow, and graceful shutdown handling" printed under a finding that says
       * deployment readiness was detected. 0.11.0 stopped these findings asserting a
       * consequence and left the instruction in place, which is the same half-fix in a
       * different column.
       */
      return finding.recommendation ? { ...finding, recommendation: '' } : finding;
    }

    const businessImpact = businessImpactFor(finding);
    return businessImpact ? { ...finding, businessImpact } : finding;
  });
}
