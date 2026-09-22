import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const finding = async (name: string, id: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'b2b-saas' });
  return report.findings.find((f) => f.id === id);
};

/**
 * The consent vendors name themselves, and the sites that use them do not.
 *
 * `cookie-consent`, `consentGiven`, `privacyConsent` and `gdprConsent` are four
 * spellings of one English word, in the one capability whose entire audience is
 * European and half of which does not write in English. A site whose banner is called
 * `consensoCookie` has none of them.
 *
 * What that audience does have is a vendor. Iubenda, Cookiebot, OneTrust,
 * Usercentrics, CookieHub, Klaro and Axeptio all publish a banner you embed, and most
 * sites embed the script rather than install a package — so the host it is fetched
 * from is the anchor. Nobody else's site serves from `cdn.iubenda.com`.
 *
 * The fixture is the measurement here and the release note says so: no repository in
 * this session's reading ships one of these, because open-source products tend not to
 * carry a commercial consent banner.
 */
describe('the consent vendor names itself', () => {
  it('reads a consent banner embedded from its vendor', async () => {
    const found = await finding('consent-from-a-vendor', 'gdpr.privacy');

    expect(found?.status).toBe('passed');
    expect(found?.evidence.some((e) => String(e.value).includes('iubenda'))).toBe(true);
  });

  /**
   * Article 20 and article 17 are both routes, and both were read by their English
   * names. A gestionale whose route is `POST /cancella-account` has none of them and
   * was told at `high` that it offers neither. The one anchor that survives
   * translation — a `DELETE` on `/account` or `/users/me` — is HTTP's verb and a
   * conventional path, and it is read already. Where even that did not fire and no
   * route name was ever read, these are the same unasked question the password reset
   * became one release ago.
   */
  it('does not claim erasure is missing when it could not read the routes', async () => {
    expect((await finding('routes-in-another-language', 'expectation.gdpr.erasure.required'))?.status).not.toBe('missing');
  });

  /** And the shape that must not soften: readable routes, no erasure, still missing. */
  it('still says missing when the routes were readable', async () => {
    expect((await finding('saas-with-nothing-but-login', 'expectation.gdpr.erasure.required'))?.status).toBe('missing');
  });
});
