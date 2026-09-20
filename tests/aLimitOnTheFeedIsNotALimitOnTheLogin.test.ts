import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const rateLimitFinding = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((finding) => finding.id === 'security.rate-limit-auth');
};

/**
 * "Rate limiting signals detected on the authentication surface", from a limiter on a
 * public feed.
 *
 * The rule is titled "Rate limit on auth surfaces" and the flag behind it was rate
 * limiting anywhere in the repository. Sign-in is the endpoint the limit exists for:
 * a throttle on a read endpoint does nothing about someone working through a password
 * list.
 */
describe('a limit on the feed is not a limit on the login', () => {
  it('does not pass a login with no throttle because something else has one', async () => {
    const finding = await rateLimitFinding('express-limits-the-feed');

    expect(finding?.status).toBe('partial');
    expect(finding?.description).toMatch(/nothing here shows it covering sign-in/i);
  });

  it('passes where the throttle is on the login itself', async () => {
    const finding = await rateLimitFinding('express-limits-the-login');

    expect(finding?.status).toBe('passed');
  });

  it('still says missing where there is no throttle at all', async () => {
    const finding = await rateLimitFinding('saas-with-nothing-but-login');

    expect(finding?.status).toBe('missing');
  });
})
