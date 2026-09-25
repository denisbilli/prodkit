import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * lemmy limits every action with the `actix-extensible-rate-limit` crate and was told at
 * `high` it has no rate limiting: the Rust crates known were governor and its wrappers.
 * A handler that answers with actix-web's own `HttpResponse::TooManyRequests()` is the
 * same decision written by hand, and the Rust form known was `StatusCode::TOO_MANY_REQUESTS`.
 */
describe('actix-web refusing too many requests', () => {
  it('reads the 429 builder as a rate limit', async () => {
    expect((await analyzeProject(fixture('actix-too-many-requests'))).detectors['security.core']?.details?.rateLimit).toBe(true);
  });

  /** lemmy's actual limiter: the `actix-extensible-rate-limit` crate as middleware. */
  it('reads actix-extensible-rate-limit as a rate limit', async () => {
    expect((await analyzeProject(fixture('actix-extensible-rate-limit'))).detectors['security.core']?.details?.rateLimit).toBe(true);
  });
});

