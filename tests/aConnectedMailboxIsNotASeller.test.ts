import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A connected mailbox is not a seller.
 *
 * `twentyhq/twenty` is a CRM, and calls every Gmail or calendar account a user links a
 * `connectedAccount`. `connected_account` was the one Stripe Connect pattern that does not
 * name Stripe, and beside a Stripe subscription elsewhere it made twenty a marketplace at
 * high confidence. The word now counts in a file that talks to Stripe; Stripe's own calls
 * count anywhere.
 */
describe('a connected mailbox is not a seller', () => {
  it('is not a marketplace', async () => {
    const analysis = await analyzeProject(fixture('a-connected-mailbox-is-not-a-seller'));

    expect(analysis.detectors['marketplace.multiRole']?.details?.connectedAccountSignals).toBe(0);
    expect(inferProductProfile(analysis).inferredProfile).not.toBe('marketplace');
  });
});
