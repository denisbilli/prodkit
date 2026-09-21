import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Rails writes both of these in Ruby, and neither looked like what was being searched
 * for.
 *
 * lobsters declares `gem "rack-attack" # rate-limiting` and keeps a
 * `content_security_policy` initializer, and its report asked at `high` for rate
 * limiting and for security headers. The rate-limit list had grown npm, Python and
 * Rust entries and skipped the ecosystem where the answer is one well-known gem; the
 * header needles held HTTP header names and Django settings.
 */
describe('a Rails application says it in Ruby', () => {
  it('reads rack-attack as the rate limiter it is', async () => {
    const analysis = await analyzeProject(fixture('rails-throttled-and-csp'));

    expect(analysis.detectors['security.core']?.details?.rateLimit).toBe(true);
  });

  it('reads a content security policy written as a Ruby block', async () => {
    const analysis = await analyzeProject(fixture('rails-throttled-and-csp'));

    expect(analysis.detectors['security.core']?.details?.helmet).toBe(true);
  });

  /**
   * In its own fixture, because the first version put the CSP and `force_ssl` in one
   * repository and neither rule could then be held: removing either left the other to
   * pass the test. That is the second fixture tonight to hide a rule that way.
   */
  it('reads force_ssl as the Strict-Transport-Security it turns on', async () => {
    const analysis = await analyzeProject(fixture('rails-force-ssl'));

    expect(analysis.detectors['security.core']?.details?.helmet).toBe(true);
  });

  /**
   * The direction this must not drift in. Rails' *default* headers — SAMEORIGIN,
   * nosniff and the rest of `DefaultHeaders` — are not counted, for the reason
   * Django's `SecurityMiddleware` is not: every application has them, so they
   * distinguish nothing. A Rails app that configures neither still says so.
   */
  it('does not credit a Rails application that configures neither', async () => {
    const analysis = await analyzeProject(fixture('rails-gdpr-delete-request'));
    const details = analysis.detectors['security.core']?.details;

    expect(details?.rateLimit).toBe(false);
    expect(details?.helmet).toBe(false);
  });
});
