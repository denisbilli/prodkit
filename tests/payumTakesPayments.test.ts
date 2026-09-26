import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function paymentsFrom(require: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-solidinvoice-'));
  await fs.writeFile(path.join(root, 'composer.json'), JSON.stringify({ require: { php: '>=8.3', 'symfony/framework-bundle': '^7.3', ...require } }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/Kernel.php'), '<?php\n\nnamespace App;\n\nclass Kernel {}\n');
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['billing.stripe']?.present;
}

/** SolidInvoice takes its clients' payments through Payum and was told it has no payment integration. */
describe('Payum', () => {
  it('is a payment integration', async () => {
    expect(await paymentsFrom({ 'payum/core': '^1.7', 'payum/paypal-express-checkout-nvp': '^1.7' })).toBe(true);
  });

  it('is not assumed without it', async () => {
    expect(await paymentsFrom({})).toBe(false);
  });
});
