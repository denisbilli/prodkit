import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { matchLines } from '../src/utils/textSearch';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * `#` opens a comment in Python, YAML and shell. In Rust it opens an attribute, and
 * `#[get("/alive")]` is the route itself.
 *
 * Every line starting with `#` was skipped as prose, so every Rust attribute was
 * invisible to every text search this analyzer makes — route macros, derives, `#[cfg]`.
 * Found on vaultwarden, which declares its liveness endpoint exactly that way and was
 * told at `high` that it has none.
 */
describe('a Rust attribute is not a comment', () => {
  it('reads a route declared as an attribute', () => {
    const hits = matchLines('#[get("/alive")]\nfn alive() {}\n', [/\/alive\b/], 'src/api.rs');

    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(1);
  });

  it('still skips a comment that happens to start with a hash', () => {
    const hits = matchLines('# health: see /healthz below\nDEBUG = True\n', [/\/health/], 'config.py');

    expect(hits).toEqual([]);
  });

  it('finds the liveness endpoint a Rocket service declares', async () => {
    const analysis = await analyzeProject(fixture('rust-rocket-alive'));

    expect(analysis.detectors['observability.core']?.details?.healthEndpoint).toBe(true);
  });
});

/**
 * Rate limiters, read from the manifest that declares them.
 *
 * `hasDep` reads `package.json` and nothing else, so `django-ratelimit` and `slowapi`
 * — both Python packages — were being looked for among npm dependencies, where they
 * can never be. They were written into the list as though they worked.
 *
 * Rust was simply absent: vaultwarden declares `governor` and calls
 * `check_limit_login` on its login route, and was told at `high` that it does not
 * throttle authentication.
 */
describe('rate limiters outside npm', () => {
  it('reads a Rust rate limiter from Cargo.toml', async () => {
    const analysis = await analyzeProject(fixture('rust-rocket-alive'));

    expect(analysis.detectors['security.core']?.details?.rateLimit).toBe(true);
  });

  it('does not credit a project that declares none', async () => {
    const analysis = await analyzeProject(fixture('rust-hyper-service'));

    expect(analysis.detectors['security.core']?.details?.rateLimit).toBe(false);
  });
});

/**
 * Identity handed to somebody else, read from npm alone.
 *
 * `auth.externalIdentityOnly` makes a password reset flow not applicable — there is
 * no password to reset — and it was computed from `package.json` and nothing else, so
 * only a JavaScript project could ever reach it. crates.io authenticates through
 * GitHub and nothing else: `oauth2` in its Cargo.toml, no password-hashing crate, no
 * reset route. It was told at `high` to build a reset flow for passwords it does not
 * have.
 *
 * The disqualifying half is the wider of the two on purpose: anything that hashes a
 * password, in any of these ecosystems, means there is a password to reset.
 */
describe('identity handed to somebody else', () => {
  it('is read from Cargo.toml as well as from package.json', async () => {
    const analysis = await analyzeProject(fixture('rust-oauth-only'));

    expect(analysis.detectors['auth.externalIdentityOnly']?.present).toBe(true);
  });

  it('is not claimed by a project that hashes a password of its own', async () => {
    const analysis = await analyzeProject(fixture('rust-hashes-passwords'));

    expect(analysis.detectors['auth.externalIdentityOnly']?.present).toBe(false);
  });

  it('stops asking an OAuth-only service for a password reset flow', async () => {
    const { buildReport } = await import('../src/report/buildReport');
    const report = buildReport(await analyzeProject(fixture('rust-oauth-only')), { profile: 'b2b-saas' });

    expect(report.findings.find((f) => f.id.includes('password-reset'))).toBeUndefined();
  });
});
