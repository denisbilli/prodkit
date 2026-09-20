import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A working sign-in reported as absent, and eight findings wrong behind it.
 *
 * An Italian business application hashes with argon2 and holds sessions with
 * iron-session. Its routes are `/accedi`, `/registrati`, `/esci`. `auth.core` came
 * back `missing` — not partial, not unknown — and the cascade followed: no password
 * reset, no MFA, no email verification, and rate limiting on auth went `unknown`
 * because "nothing here authenticates anybody, so there is no login surface to
 * throttle".
 *
 * Nothing about that application is unusual. Two packages were off a list and the
 * routes were in another language, which is the thing this product says out loud
 * about everybody else's code: the analyzer was reading a language rather than a
 * program.
 */
describe('an authentication system is one in any language', () => {
  it('finds a login whose routes are not in English', async () => {
    const analysis = await analyzeProject(fixture('autenticazione-in-italiano'));

    expect(analysis.detectors['auth.core']?.present).toBe(true);
  });

  it('points at the line where the password is checked', async () => {
    const analysis = await analyzeProject(fixture('autenticazione-in-italiano'));
    const used = (analysis.detectors['auth.core']?.evidence ?? []).filter((item) => item.line);

    expect(used.length).toBeGreaterThan(0);
    expect(used[0].file).toMatch(/server\.js$/);
  });

  it('asks the questions that only apply once somebody can sign in', async () => {
    // The cascade is the point. With no authentication found, rate limiting on the
    // login surface was `unknown` — the check declining to apply — when the truth is
    // that the surface exists and has no throttle.
    const report = buildReport(await analyzeProject(fixture('autenticazione-in-italiano')), {
      profile: 'b2b-saas',
    });
    const rateLimit = report.findings.find((finding) => finding.id === 'security.rate-limit-auth');

    expect(rateLimit?.status).toBe('missing');
  });

  it('still finds nothing where there is nothing', async () => {
    const analysis = await analyzeProject(fixture('npm-library'));

    expect(analysis.detectors['auth.core']?.present).toBe(false);
  });
})
