import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const statusOf = async (name: string, id: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'marketplace' });
  return report.productProfile?.capabilities.find((c) => c.capabilityId === id)?.status ?? 'absent';
};

/**
 * A marketplace does not have to be written in English to be one.
 *
 * `mercato-in-italiano` creates Stripe connected accounts, transfers money to them,
 * computes a 12% `provvigione` in code and opens rows in `db.contestazioni`. Every
 * marketplace detector but the payout one looked for an English word, so the report
 * said: seller roles missing, commission missing, dispute handling missing — three
 * confident wrong answers about a repository that has all three.
 *
 * The payment platform is the anchor. `stripe.accounts.create` is a connected account,
 * and a connected account is a supply side by Stripe's own contract, in any language.
 * The cut and the dispute have no such anchor here — arithmetic and an author-named
 * table — so they are withdrawn rather than answered.
 */
describe('the marketplace in another language', () => {
  it('reads the supply side off the connected account, not off the word', async () => {
    expect(await statusOf('mercato-in-italiano', 'marketplace.multi-role')).toBe('partial');
  });

  it('does not claim a commission is absent when it could not read the word for it', async () => {
    expect(await statusOf('mercato-in-italiano', 'marketplace.commission')).toBe('unknown');
  });

  it('does not claim dispute handling is absent for the same reason', async () => {
    expect(await statusOf('mercato-in-italiano', 'marketplace.dispute')).toBe('unknown');
  });

  /**
   * And the withdrawal has to stay away from a repository that does spell both sides.
   *
   * `marketplace-that-names-its-sides` writes them the way English code actually
   * writes them — `onboardSeller`, `db.sellers`, `buyerId`, `sellerAccountId` — none
   * of which a `\bseller\b` word boundary matches. With the old patterns this fixture
   * had zero vocabulary signals too, so it would have been read as a repository whose
   * words are not ours, and its genuinely missing commission and dispute would have
   * been withdrawn instead of reported.
   */
  it('still reports what is missing from a marketplace it can read', async () => {
    expect(await statusOf('marketplace-that-names-its-sides', 'marketplace.multi-role')).toBe('present');
    expect(await statusOf('marketplace-that-names-its-sides', 'marketplace.commission')).toBe('missing');
    expect(await statusOf('marketplace-that-names-its-sides', 'marketplace.dispute')).toBe('missing');
  });
});
