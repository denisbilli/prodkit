import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { renderMarkdown } from '../src/report/markdownReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const reset = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'b2b-saas' });
  return report.findings.find((f) => f.id === 'expectation.auth.password-reset.required');
};

/**
 * A project whose routes are not in English was told what it has is missing.
 *
 * A gestionale with `/accedi`, `/recupero-password` and `/conferma-email` — bcrypt,
 * jsonwebtoken, the whole flow written out — came back at `high` with no password
 * reset and no email verification. The searches look for "forgot password",
 * "password_reset" and "verify email", and `recuperoPassword` is none of those.
 *
 * Adding the Italian words would have fixed Italian and left Japanese, Spanish and
 * every other language exactly where they were. That is the guessing this analyzer
 * exists to stop, so it is not what was done.
 *
 * What can be known is whether a route name was ever read at all. Where a project
 * authenticates — proved by a password-hashing package, which is nobody's choice of
 * word — and none of `/login`, `/register`, `/signin` ever matched, its routes are
 * named in something else and the reset search never had a chance.
 *
 * Blindness may turn a verdict into no verdict; it may never turn it into the
 * opposite verdict. The same rule the report already applies to a language it cannot
 * parse, applied to a vocabulary it cannot read.
 */
describe('routes in another language', () => {
  it('does not claim a reset flow is missing when it could not read the routes', async () => {
    const found = await reset('routes-in-another-language');

    expect(found?.status).not.toBe('missing');
  });

  /**
   * And the shape this must not soften. A project whose routes this *can* read, with
   * nothing but a login on them, still has no password reset and is still told so.
   */
  it('still says missing when the routes were readable and had no reset', async () => {
    expect((await reset('saas-with-nothing-but-login'))?.status).toBe('missing');
  });

  /**
   * And it says so out loud, which is the half that nearly shipped missing.
   *
   * Withdrawing the claim is only right if the reader learns why. A withdrawn
   * expectation emits no finding at all — `shouldCreateFinding` drops every `unknown`
   * — so the report of a project whose routes are `/accedi` and `/recupero-password`
   * had four questions simply absent from it, with nothing saying they had been
   * asked and not answered. The note sits beside the reading-depth line, which exists
   * for exactly the same reason one capability up.
   */
  it('tells the reader that the routes are why four questions went unanswered', async () => {
    const report = buildReport(await analyzeProject(fixture('routes-in-another-language')), { profile: 'b2b-saas' });

    expect(report.diagnostics.routeNamesUnread).toBe(true);
    expect(renderMarkdown(report)).toMatch(/No route name in this repository matched/);
  });

  it('says nothing of the sort when the routes were readable', async () => {
    const report = buildReport(await analyzeProject(fixture('saas-with-nothing-but-login')), { profile: 'b2b-saas' });

    expect(report.diagnostics.routeNamesUnread).toBe(false);
    expect(renderMarkdown(report)).not.toMatch(/No route name in this repository matched/);
  });
});
