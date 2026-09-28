import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function payout(code: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-erxes-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'accounting', dependencies: { express: '4.19.0', mongoose: '8.0.0' } }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/accounts.ts'), code);
  const found = (await analyzeProject(root)).detectors['marketplace.payout']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** erxes keeps a ledger in a Mongoose model called Accounts, and a CRM became a marketplace. */
describe('A ledger account', () => {
  it('is not a connected account when the model creates one', async () => {
    expect(await payout('export const add = (models, doc) => models.Accounts.create({ ...doc });\n')).toBe(false);
  });

  it('is not a connected account when a method creates one', async () => {
    expect(await payout('export const add = (stripe, doc) => stripe.accounts.createAccount(doc);\n')).toBe(false);
  });

  it("is still Stripe's own call", async () => {
    expect(await payout('export const onboard = (stripe, email) => stripe.accounts.create({ type: "express", email });\n')).toBe(true);
  });
});

async function multiRole(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-erxes-pos-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'posclient', dependencies: { express: '4.19.0' } }));
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const found = (await analyzeProject(root)).detectors['marketplace.multiRole']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** erxes' point of sale prints the shop's own taxpayer number on every receipt. */
describe("A merchant's tax number", () => {
  it('is not a supply side', async () => {
    expect(await multiRole({
      'src/db/models/PutData.ts': 'export const putData = (config) => ({ merchantTin: config.merchantTin });\n',
      'src/db/models/Receipt.ts': 'export const receipt = (config) => ({ merchant_tin: config.merchantTin });\n',
    })).toBe(false);
  });

  it('is not every merchant', async () => {
    expect(await multiRole({
      'src/db/models/PutData.ts': 'export const putData = (config) => ({ merchantName: config.merchantName });\n',
      'src/db/models/Receipt.ts': 'export const receipt = (config) => ({ merchant_name: config.merchantName });\n',
    })).toBe(true);
  });
});
