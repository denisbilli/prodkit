import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function multiRole(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-bigcapital-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'server', dependencies: { '@nestjs/core': '10.0.0', stripe: '16.0.0' } }));
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const found = (await analyzeProject(root)).detectors['marketplace.multiRole']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

const webhooks = "import type Stripe from 'stripe';\n\nexport function handle(event: Stripe.Event) {\n  switch (event.type) {\n    case 'account.updated':\n      return sync(event.data.object);\n  }\n}\n";

/**
 * bigcapital connects its customers' own Stripe accounts so they can take invoice
 * payments, with the account type on the line after the call, and was a marketplace.
 */
describe('A standard account created over several lines', () => {
  it('is not a supply side, nor is the event about it', async () => {
    expect(await multiRole({
      'src/StripePaymentService.ts': "export async function createAccount(stripe) {\n  return stripe.accounts.create({\n    type: 'standard',\n  });\n}\n",
      'src/StripePaymentWebhooks.controller.ts': webhooks,
    })).toBe(false);
  });

  it('is still an express account over several lines', async () => {
    expect(await multiRole({
      'src/StripePaymentService.ts': "export async function createAccount(stripe) {\n  return stripe.accounts.create({\n    type: 'express',\n  });\n}\n",
    })).toBe(true);
  });

  it('leaves the event to a marketplace that creates express accounts too', async () => {
    expect(await multiRole({
      'src/StripePaymentService.ts': "export async function createAccount(stripe) {\n  return stripe.accounts.create({\n    type: 'standard',\n  });\n}\n",
      'src/sellers.ts': "export const onboard = (stripe) => stripe.accounts.create({ type: 'express' });\n",
      'src/StripePaymentWebhooks.controller.ts': webhooks,
    })).toBe(true);
  });

  it('reads each call to its own closing parenthesis', async () => {
    expect(await multiRole({
      'src/StripePaymentService.ts': "export async function onboard(stripe) {\n  const seller = await stripe.accounts.create({ type: 'express' });\n  const own = await stripe.accounts.create({\n    type: 'standard',\n  });\n  return [seller, own];\n}\n",
    })).toBe(true);
  });

  it('leaves the event alone where no account is created', async () => {
    expect(await multiRole({ 'src/StripePaymentWebhooks.controller.ts': webhooks })).toBe(true);
  });
});
