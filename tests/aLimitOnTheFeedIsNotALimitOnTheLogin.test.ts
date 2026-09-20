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

  /**
   * The name is the one part of the code its author chose freely, and it is what
   * every search here reads. Denis put it plainly: "if I wanted to call it
   * `thisIsFuckingTopUse` you would never catch it."
   *
   * He was right, and the answer is not a longer word list. The anchor is the package
   * specifier — `express-rate-limit` is what the ecosystem calls it, not what this
   * author called it — and from that import the chain is mechanical: the binding it
   * is assigned to, the values that binding produces when called, and every place
   * those values are used. Following a binding is not a heuristic; it is what the
   * language already means.
   */
  it('finds a limiter whose author gave it any name at all', async () => {
    const finding = await rateLimitFinding('express-limits-with-a-silly-name');

    expect(finding?.status).toBe('passed');
  });

  /**
   * The same defect in the other direction, found on a real repository.
   *
   * dokploy has a settings form where its *users* configure limits on the API keys
   * they issue: `rateLimitEnabled: z.boolean().optional()` in a zod schema. The
   * application itself throttles nothing — no package, no 429 anywhere in its source
   * — and the report said it was throttled, because `/rate_?limit/i` matched a field
   * name.
   *
   * `429`, `Retry-After` and `TooManyRequests` stay, because nobody chose them: they
   * are what HTTP calls this. The word "rateLimit" is what somebody called a checkbox.
   */
  it('does not read a form field named rateLimitEnabled as throttling', async () => {
    const finding = await rateLimitFinding('rate-limit-is-a-form-field');

    expect(finding?.status).toBe('missing');
  });

  /**
   * Being throttled is not throttling.
   *
   * `\b429\b` matched both directions. nocodb's webhook invoker handles a 429 coming
   * back from somebody else's server — this project being refused, the opposite of
   * this project refusing — and it was among the lines behind "rate limiting is in
   * place somewhere". HTTP names the number; the direction is in the shape around it.
   */
  it('does not read handling a 429 from somebody else as throttling', async () => {
    const finding = await rateLimitFinding('receives-a-429');

    expect(finding?.status).toBe('missing');
  });

  it('reads a limiter mounted on a prefix as covering what is mounted under it', async () => {
    // `app.use('/api/', gate)` above `app.use('/api/auth', authRoutes)`: the router is
    // in another file and the coverage is still readable, because both mount paths are
    // strings in this one. A same-file test alone called this unprotected, and a real
    // project in the corpus is shaped exactly like it.
    const finding = await rateLimitFinding('express-limits-a-prefix');

    expect(finding?.status).toBe('passed');
  });
})
