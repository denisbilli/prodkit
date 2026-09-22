import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * `/status` is the other name for `/health`.
 *
 * `netbox-community/netbox` answers "is this thing up" at
 * `path('api/status/', StatusView.as_view())` and was reported as having no health
 * endpoint at all. The pattern held five spellings of one word — health, healthz,
 * healthcheck, readyz, livez — and none of the other, though `/status` is what GitHub,
 * Stripe and most status pages use.
 *
 * It has to be quoted to count, because `status` is also a field on nearly every JSON
 * response ever written: measured across the corpus, the unquoted form matched
 * `{"status": "ok"}` and `"status": 200` in four fixtures, and the quoted form matches
 * exactly two things — one fixture with a real `/status` route, and netbox.
 */
describe('the other name for the same endpoint', () => {
  it('accepts a service status route', async () => {
    const analysis = await analyzeProject(fixture('it-says-status-not-health'));

    expect(analysis.detectors['observability.core']?.details?.healthEndpoint).toBe(true);
  });

  /**
   * And neither a `{"status": "shipped"}` in a response body nor a route that reports on
   * one order answers it. `status-of-a-thing-not-the-service` ships both and no health
   * route, so it is what keeps the pattern above from being a word search.
   */
  it('is not answered by an order reporting its own status', async () => {
    const analysis = await analyzeProject(fixture('status-of-a-thing-not-the-service'));

    expect(analysis.detectors['observability.core']?.details?.healthEndpoint).toBe(false);
  });
});
