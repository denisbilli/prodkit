import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function connected(code: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-crm-'));
  await fs.writeFile(path.join(root, 'requirements.txt'), 'django==5.0\n');
  await fs.mkdir(path.join(root, 'webhooks'), { recursive: true });
  await fs.writeFile(path.join(root, 'webhooks/events.py'), code);
  const found = (await analyzeProject(root)).detectors['marketplace.multiRole']?.details?.connectedAccountSignals;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** Django-CRM offers its subscribers account.updated for a customer company, and read as a marketplace. */
describe("A product's own account.updated", () => {
  it('is not Stripe Connect', async () => {
    expect(await connected('CATALOGUE = (\n    ("account", "Accounts", ("account.created", "account.updated", "account.deleted")),\n)\n')).toBe(0);
  });

  it("is Stripe's in a Stripe webhook", async () => {
    expect(await connected('import stripe\n\ndef handle(event):\n    if event.type == "account.updated":\n        sync(event.data.object)\n')).toBe(1);
  });
});
