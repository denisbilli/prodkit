import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function detectors(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-invoiceplane-'));
  await fs.writeFile(path.join(root, 'composer.json'), '{"require":{"stripe/stripe-php":"^16.0"}}\n');
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const found = (await analyzeProject(root)).detectors;
  await fs.rm(root, { recursive: true, force: true });
  return {
    multiRole: found['marketplace.multiRole']?.present,
    payout: found['marketplace.payout']?.present,
    commission: found['marketplace.commission']?.present,
  };
}

/** InvoicePlane logs what the gateway answered and the fee on a session it was paid through. */
describe('Invoicing software', () => {
  it('is not a marketplace for logging gateway responses and a session fee', async () => {
    expect(await detectors({
      'application/modules/guest/controllers/gateways/Stripe.php': "<?php\n$note = 'fee: ' . $session->application_fee_amount;\n",
      'application/modules/guest/controllers/gateways/Paypal.php': "<?php\n$this->db->insert('ip_merchant_responses', ['merchant_response_successful' => true]);\n",
      'application/modules/filter/controllers/Ajax.php': "<?php\n$this->mdl_payment_logs->like('merchant_response_id', $query);\n",
    })).toEqual({ multiRole: false, payout: false, commission: false });
  });

  it('still takes a cut when it sets the fee', async () => {
    const found = await detectors({
      'src/controllers/checkout.controller.php': "<?php\n$session = $stripe->checkout->sessions->create(['payment_intent_data' => ['application_fee_amount' => 150]]);\n",
    });
    expect(found.payout).toBe(true);
    expect(found.commission).toBe(true);
  });

  it('still reads merchants on both sides of a store', async () => {
    expect((await detectors({
      'src/models/Merchant.php': "<?php\nclass Merchant { public $merchantName; }\n",
      'src/controllers/merchants.controller.php': "<?php\n$merchantName = $request->merchantName;\n",
    })).multiRole).toBe(true);
  });

  it('is not a fee read off the session in JavaScript either', async () => {
    const found = await detectors({ 'src/controllers/payments.controller.js': 'export const log = (session) => logger.info({ fee: session.application_fee_amount });\n' });
    expect(found.payout).toBe(false);
    expect(found.commission).toBe(false);
  });
});
