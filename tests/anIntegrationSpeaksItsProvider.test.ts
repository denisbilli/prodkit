import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(pieceEntry: string, server: Record<string, string> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-activepieces-'));
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'activepieces', private: true, workspaces: ['packages/*'] }),
    'packages/server/package.json': JSON.stringify({ name: 'api', dependencies: { fastify: '5.0.0' } }),
    'packages/server/src/flow.controller.ts': 'export const run = async (req) => ({ id: req.params.id });\n',
    'packages/piece-marketplace/package.json': JSON.stringify({ name: '@activepieces/piece-marketplace' }),
    'packages/piece-marketplace/src/index.ts': pieceEntry,
    'packages/piece-marketplace/src/lib/model/seller.ts': 'export const listSellers = () => fetch("https://api.example.com/v1/sellers");\nexport const sellerSchema = { seller_id: "string" };\n',
    'packages/piece-marketplace/lib/routes/payouts.ts': 'export const createPayout = (sellerId) => fetch("https://api.example.com/v1/payouts", { method: "POST" });\n',
    ...server,
  };
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/**
 * activepieces' 733 pieces call Stripe, Checkout.com and Cashfree Payouts, and their
 * words made a workflow-automation product a marketplace.
 */
describe('An integration speaks its provider', () => {
  it("is not the product's own supply side", async () => {
    const analysis = await analyze('import { createPiece } from "@activepieces/pieces-framework";\n\nexport const marketplace = createPiece({ displayName: "Marketplace", actions: [] });\n');

    expect(analysis.detectors['marketplace.multiRole']?.present).toBe(false);
    expect(analysis.detectors['marketplace.payout']?.present).toBe(false);
  });

  /** The server imports the framework too, to load and run the pieces. */
  it('is not every package that imports the framework', async () => {
    const analysis = await analyze('import { createPiece } from "@activepieces/pieces-framework";\n\nexport const marketplace = createPiece({ displayName: "Marketplace", actions: [] });\n', {
      'packages/server/src/seller.model.ts': 'import { PieceMetadata } from "@activepieces/pieces-framework";\nexport const sellerSchema = { seller_id: "string", metadata: PieceMetadata };\n',
      'packages/server/src/payouts.controller.ts': 'import { PieceMetadata } from "@activepieces/pieces-framework";\nexport const createPayout = (seller) => seller;\n',
    });

    expect(analysis.detectors['marketplace.multiRole']?.present).toBe(true);
  });

  it('is only a package built on the pieces framework', async () => {
    const analysis = await analyze('import { createPiece } from "./factory";\n\nexport const marketplace = createPiece({ name: "Marketplace" });\n');

    expect(analysis.detectors['marketplace.multiRole']?.present).toBe(true);
    expect(analysis.detectors['marketplace.payout']?.present).toBe(true);
  });
});
