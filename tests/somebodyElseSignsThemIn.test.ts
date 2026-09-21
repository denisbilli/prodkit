import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Signing in can happen before the request arrives.
 *
 * Orange Meets — Cloudflare's own video product, open source and in production — has
 * no auth package in its manifest and no `/login` route, and the report told it
 * "anyone who finds a URL can use the product and read whatever it exposes". It sits
 * behind Cloudflare Access: every request carries a signed `CF_Authorization` cookie
 * that `app/root.tsx` decodes and checks for expiry. The sign-in it was accused of
 * lacking happens at the edge.
 *
 * The anchor is the name. `CF_Authorization`, `x-goog-iap-jwt-assertion`,
 * `x-amzn-oidc-data` and `X-MS-CLIENT-PRINCIPAL` are published by Cloudflare, Google,
 * AWS and Azure; no author in any repository invented one of them, and reading one is
 * how an application asks the proxy who is calling.
 *
 * The fixture is also a Worker, which usually means a fixture carrying two signals and
 * hiding both. Here the second is a precondition rather than a second rule: with
 * nothing serving requests the report says there is nobody to authenticate, and the
 * question this test asks cannot be put at all.
 */
describe('somebody else signs them in', () => {
  it('reads an identity proxy in front of the app as authentication', async () => {
    const analysis = await analyzeProject(fixture('identity-proxy-in-front'));
    expect(analysis.detectors['auth.core']?.present).toBe(true);
  });

  /**
   * And the report says it, rather than recommending the app add what the platform
   * already does.
   */
  it('stops telling it that anyone who finds a URL can use it', async () => {
    const report = buildReport(await analyzeProject(fixture('identity-proxy-in-front')), { profile: 'auto' });
    const auth = report.findings.find((f) => f.id === 'auth.core');

    expect(auth?.status).not.toBe('missing');
  });
});
