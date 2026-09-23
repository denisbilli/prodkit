import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Stripe's signature check, in the SDKs that do not write camelCase.
 *
 * `maybe-finance/maybe` verifies every Stripe webhook with
 * `client.parse_thin_event(webhook_body, sig_header, webhook_secret)` — Stripe's v2 thin
 * events, parsed and verified in one call — and was told its webhook integrity was
 * partial, because the only verification this knew was `constructEvent(`.
 */
describe('Stripe verifies in every SDK', () => {
  it('reads parse_thin_event as the signature being checked', async () => {
    const analysis = await analyzeProject(fixture('rails-stripe-thin-events'));

    expect(analysis.detectors['billing.webhook.signatureValidation']?.present).toBe(true);
  });
});
