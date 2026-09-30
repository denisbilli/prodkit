import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(require: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-sylius-'));
  await fs.writeFile(path.join(root, 'composer.json'), JSON.stringify({ require: { 'symfony/framework-bundle': '^6.4', ...require } }));
  await fs.mkdir(path.join(root, 'src/Controller'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/Controller/OrderController.php'), '<?php\nclass OrderController {}\n');
  const detectors = (await analyzeProject(root)).detectors;
  await fs.rm(root, { recursive: true, force: true });
  return {
    billing: detectors['billing.stripe']?.present,
    mail: detectors['notifications.transactional']?.details?.emailDependency,
  };
}

/** Sylius takes payments through Payum's Symfony bundle and mails through Symfony's Mailer. */
describe('Sylius', () => {
  it("takes payments through Payum's bundle", async () => {
    expect((await analyze({ 'payum/payum-bundle': '^2.5' })).billing).toBe(true);
  });

  it("sends mail through Symfony's Mailer, declared", async () => {
    expect((await analyze({ 'symfony/mailer': '^6.4' })).mail).toBe(true);
  });

  it('is neither without them', async () => {
    expect(await analyze({})).toEqual({ billing: false, mail: false });
  });
});
