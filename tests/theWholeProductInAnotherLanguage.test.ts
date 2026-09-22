import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

/**
 * A whole product, none of whose words are English.
 *
 * The detectors were taken off author-chosen names one family at a time — auth routes,
 * GDPR endpoints, consent vendors, marketplace sides, guardrail libraries — and each
 * of those has its own fixture. None of them answers the question the reader actually
 * has: what does a report on a product written in another language look like, end to
 * end?
 *
 * `gestionale-in-italiano` is a B2B SaaS that does the work: helmet with HSTS, a CORS
 * allowlist, a rate limit, bcrypt at cost 12, TOTP, an httpOnly/secure/sameSite
 * cookie, zod on the request body, password reset with an expiring token, email
 * confirmation, personal data export and erasure, Prisma queries scoped by
 * `aziendaId`, pino, Sentry, BullMQ, a health route, CI, a Dockerfile with
 * HEALTHCHECK and NODE_ENV=production. Its routes are `/accesso`, `/iscrizione`,
 * `/parola-dimenticata`, `/conferma-posta`, `/miei-dati`.
 *
 * Every capability it genuinely implements is found. What it genuinely lacks — roles,
 * API keys, consent, retention, an audit trail, a request id, graceful shutdown — is
 * still reported, which is the half that makes the other half worth anything.
 */
describe('the whole product in another language', () => {
  const report = async () =>
    buildReport(await analyzeProject(path.resolve(__dirname, 'fixtures', 'gestionale-in-italiano')), {
      profile: 'b2b-saas',
    });

  const statuses = async () => {
    const built = await report();
    return new Map((built.productProfile?.capabilities ?? []).map((c) => [c.capabilityId, c.status]));
  };

  it('finds what the product does, in Italian', async () => {
    const status = await statuses();

    for (const id of [
      'auth.baseline',
      'auth.mfa',
      'security.headers',
      'security.cors',
      'security.rate-limit',
      'authz.ownership',
      'billing.model',
      'observability.health',
      'deployment.docker',
    ]) {
      expect([id, status.get(id)]).toEqual([id, 'present']);
    }
  });

  /**
   * The four that the unreadable-routes rule withdraws. `/parola-dimenticata` and
   * `/conferma-posta` are real and were not read, and saying so is the whole point of
   * that rule: blindness turns a verdict into no verdict, never into the opposite one.
   */
  it('withdraws what it could not read rather than denying it', async () => {
    const status = await statuses();

    for (const id of ['auth.password-reset', 'auth.email-verification', 'gdpr.export', 'gdpr.erasure']) {
      expect([id, status.get(id)]).toEqual([id, 'unknown']);
    }
  });

  /**
   * And still says what is not there. A report that answers "unknown" to everything it
   * cannot read in English would be useless in a different way.
   */
  it('still reports what the product does not do', async () => {
    const status = await statuses();

    for (const id of ['authz.roles', 'auth.api-keys', 'gdpr.consent', 'gdpr.retention', 'audit.baseline']) {
      expect([id, status.get(id)]).toEqual([id, 'missing']);
    }
  });
});
