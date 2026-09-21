import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const finding = async (name: string, id: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === id);
};

/**
 * A cap is there to bound work, and it had come to decide the answer.
 *
 * Four searches found the files that make up a project's authentication surface, and
 * they shared one budget of forty matches. n8n ships about four hundred
 * `*.credentials.ts` files describing how to authenticate to *other people's* APIs —
 * Airtop, Action Network, Microsoft — and thirty-eight of them filled the budget.
 * `packages/cli/src/controllers/auth.controller.ts`, the sign-in controller, never
 * entered the set, so n8n's login — throttled by IP and by email — was reported
 * unprotected, cited on a Discord node's type guard for somebody else's 429.
 *
 * Per pattern, the decisive search keeps its own budget however much noise the others
 * find.
 */
describe('the cap was deciding the answer', () => {
  it('finds the sign-in controller behind a wall of third-party credentials', async () => {
    expect((await finding('many-third-party-credentials', 'security.rate-limit-auth'))?.status).toBe('passed');
  });

  /**
   * And the limit itself, declared where the route is declared.
   *
   * n8n writes `@Post('/login', { ipRateLimit: {...}, keyedRateLimit: ... })` and
   * applies both in its controller registry. Nothing in that file imports
   * `express-rate-limit` — a service does — and nothing in it issues a 429, because
   * the package does. The word `rateLimit` alone is what dokploy taught us not to
   * trust; what makes this different is that it sits inside the declaration of a route
   * whose path is a sign-in path, in a project that declares a limiter package.
   */
  it('reads a limit declared in the login route\'s own options', async () => {
    const found = await finding('limits-the-login-in-route-options', 'security.rate-limit-auth');

    expect(found?.status).toBe('passed');
    expect(found?.evidence.some((e) => e.file === 'src/auth.controller.ts')).toBe(true);
  });
});
