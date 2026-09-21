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

/**
 * Laravel's limiter is part of the framework, not a package to depend on.
 *
 * `Route::middleware(['throttle:api'])` applies it and `RateLimiter::for('api', ...)`
 * defines the limit. A list of packages could never find either, and monica — which
 * writes both — was told at `high` that it does not throttle.
 */
describe('a Laravel application throttles with the framework', () => {
  it('reads the throttle middleware alias', async () => {
    const analysis = await analyzeProject(fixture('laravel-throttled'));

    expect(analysis.detectors['security.core']?.details?.rateLimit).toBe(true);
  });

  /**
   * In its own fixture: the first version put the alias and `RateLimiter::for` in one
   * repository, so removing either left the other to pass. Third fixture tonight to
   * hide a rule that way.
   */
  it('reads the limit definition on its own', async () => {
    const analysis = await analyzeProject(fixture('laravel-rate-limiter-for'));

    expect(analysis.detectors['security.core']?.details?.rateLimit).toBe(true);
  });

  it('does not credit a Laravel application that applies none', async () => {
    const analysis = await analyzeProject(fixture('laravel-open-cors'));

    expect(analysis.detectors['security.core']?.details?.rateLimit).toBe(false);
  });
});

/**
 * The processor, declared wherever this project declares its dependencies.
 *
 * `hasDep` reads `package.json` and nothing else, so a product that charges people in
 * any other language had to be caught by a `STRIPE_` variable search instead. pretix
 * is a ticketing platform with `stripe`, `paypalrestsdk` and
 * `paypal-checkout-serversdk` in its pyproject, and it was told at `high` that it has
 * no way to charge for the product.
 */
describe('a payment processor outside npm', () => {
  it('is read from the Python manifest', async () => {
    const analysis = await analyzeProject(fixture('pretix-like-payments'));

    expect(analysis.detectors['billing.stripe']?.present).toBe(true);
  });

  /**
   * Only processors, not billing vocabulary. This fixture exists to hold that line:
   * a route called `/api/billing/plans` is still not a payment integration.
   */
  it('is not read from billing words', async () => {
    const analysis = await analyzeProject(fixture('movie-like-billing-no-stripe'));

    expect(analysis.detectors['billing.stripe']?.present).toBe(false);
  });
});
