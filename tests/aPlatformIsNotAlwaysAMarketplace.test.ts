import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A payments platform is not always a marketplace, and Stripe says which.
 *
 * `invoiceninja/invoiceninja` is invoicing software that lets the companies it serves take
 * their own clients' payments: it creates `standard` connected accounts, with no application
 * fee. Stripe draws the line itself — a `standard` account belongs to a business with its
 * own Stripe relationship, which a SaaS platform connects; `express` and `custom` accounts
 * are the ones a marketplace onboards for the sellers it pays. Its "payouts" and
 * "commission" were a referral programme's report, its sellers a tax model's
 * `seller_subregion` and Apple Pay's merchant id.
 */
describe('a platform is not always a marketplace', () => {
  it('does not read standard accounts, referrals, tax or merchant ids as a marketplace', async () => {
    const analysis = await analyzeProject(fixture('a-saas-that-lets-customers-take-payments'));

    expect(analysis.detectors['marketplace.multiRole']?.present).toBe(false);
    expect(analysis.detectors['marketplace.payout']?.evidence.some((e) => /referral/i.test(`${e.file} ${e.value}`))).toBe(false);
    expect(analysis.detectors['marketplace.commission']?.present).toBe(false);
  });

  it('still reads express accounts as a supply side', async () => {
    const analysis = await analyzeProject(fixture('a-marketplace-with-express-accounts'));

    expect(analysis.detectors['marketplace.multiRole']?.details?.connectedAccountSignals).toBeGreaterThan(0);
  });
});
