import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A marketplace that says provider and customer.
 *
 * Sharetribe's web template onboards every provider through a `stripeConnectAccount`, takes
 * a provider commission in every line item, pays out and handles disputes — and was
 * inferred as a consumer app. Its supply side is named for Stripe Connect, which the
 * connected-account patterns did not spell; and a commission, the one thing only a
 * marketplace does, did not count toward the profile at all.
 */
describe('a marketplace that says provider', () => {
  it('finds the supply side in a Stripe Connect account', async () => {
    const analysis = await analyzeProject(fixture('a-marketplace-that-says-provider'));

    expect(analysis.detectors['marketplace.multiRole']?.present).toBe(true);
  });

  it('is inferred as a marketplace when the platform keeps a cut', async () => {
    const analysis = await analyzeProject(fixture('a-marketplace-that-says-provider'));

    expect(inferProductProfile(analysis).inferredProfile).toBe('marketplace');
  });
});
