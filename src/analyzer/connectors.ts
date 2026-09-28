import type { DetectContext } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';

/**
 * Packages that are an integration with somebody else's service, and every file in them.
 *
 * activepieces ships 733 pieces — one package each for Stripe, Checkout.com, Cashfree
 * Payouts, SimpliRoute — whose actions and output schemas spell `seller_message`,
 * `commission_amount` and `payout-api.cashfree.com`. Those are the words of the APIs the
 * pieces call, and they made a workflow-automation product a marketplace at high
 * confidence.
 *
 * The anchor is the SDK a piece is written against: its entry point calls `createPiece(`
 * imported from `@activepieces/pieces-framework`. Depending on the framework is not
 * enough — the server, the worker and the web app all do.
 */
const PIECES_FRAMEWORK_IMPORT = /\bfrom\s+['"]@activepieces\/pieces-framework['"]/;

export async function connectorPackageFiles(ctx: DetectContext): Promise<Set<string>> {
  const manifests = new Set(
    ctx.files.all
      .filter((file) => file === 'package.json' || file.endsWith('/package.json'))
      .map((file) => (file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '')),
  );

  const roots = new Set<string>();
  for (const file of ctx.files.source.filter((f) => /\.[cm]?[jt]s$/.test(f))) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text || !text.includes('createPiece(') || !PIECES_FRAMEWORK_IMPORT.test(text)) continue;
    let directory = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
    while (directory && !manifests.has(directory)) {
      directory = directory.includes('/') ? directory.slice(0, directory.lastIndexOf('/')) : '';
    }
    // A piece at the repository root is the whole repository: nothing else to judge by.
    if (directory) roots.add(directory);
  }

  const files = new Set<string>();
  if (roots.size === 0) return files;
  for (const file of ctx.files.all) {
    for (const root of roots) {
      if (file.startsWith(`${root}/`)) { files.add(file); break; }
    }
  }
  return files;
}
