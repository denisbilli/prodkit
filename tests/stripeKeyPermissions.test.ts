import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function detectors(constants: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-infisical-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'backend', dependencies: { fastify: '5.0.0', stripe: '16.0.0' } }));
  await fs.mkdir(path.join(root, 'src/services/stripe-api-key'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/services/stripe-api-key/stripe-api-key-rotation-constants.ts'), constants);
  const found = (await analyzeProject(root)).detectors;
  await fs.rm(root, { recursive: true, force: true });
  return {
    multiRole: found['marketplace.multiRole']?.present,
    payout: found['marketplace.payout']?.present,
    commission: found['marketplace.commission']?.present,
  };
}

/** Infisical rotates its customers' Stripe keys and lists the scopes a key may hold. */
describe("A Stripe key's permissions", () => {
  it('are not a marketplace', async () => {
    expect(await detectors('export const STRIPE_PERMISSIONS = [\n  { name: "Connected accounts", read: "connected_account_read" },\n  { name: "Payouts", read: "payout_read", write: "payout_write" },\n  { name: "Application fees", read: "application_fee_read", write: "application_fee_write" },\n];\n')).toEqual({ multiRole: false, payout: false, commission: false });
  });

  it('leave the calls that move money alone', async () => {
    expect(await detectors('export const onboard = (stripe) => stripe.accounts.create({ type: "express" });\nexport const pay = (stripe, id) => stripe.payouts.create({ amount: 100 }, { stripeAccount: id });\nexport const charge = (stripe) => stripe.paymentIntents.create({ application_fee_amount: 150 });\n')).toEqual({ multiRole: true, payout: true, commission: true });
  });
});
