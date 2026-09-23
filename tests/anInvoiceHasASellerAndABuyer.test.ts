import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * An invoice has a seller and a buyer, and so does every sale.
 *
 * `kimai/kimai`, time tracking for a company that bills its own customers, was inferred
 * as a marketplace at high confidence. Its invoice hydrator calls the issuing company
 * `$seller`, and its Customer entity and a migration carry `buyer_reference` — EN 16931's
 * BT-10. Those are the two parties to an invoice. And even without the invoice, the rule
 * accepted buyers alone in two files, though every shop has buyers: it is somebody else
 * selling through the product that makes a marketplace.
 */
describe('an invoice has a seller and a buyer', () => {
  it('is not a marketplace', async () => {
    const analysis = await analyzeProject(fixture('an-invoice-has-a-seller-and-a-buyer'));

    expect(analysis.detectors['marketplace.multiRole']?.present).toBe(false);
    expect(inferProductProfile(analysis).inferredProfile).not.toBe('marketplace');
  });
});
