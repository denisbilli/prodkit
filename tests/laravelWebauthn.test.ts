import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function secondFactor(require: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-lychee-'));
  await fs.writeFile(path.join(root, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^11.0', ...require } }));
  await fs.mkdir(path.join(root, 'app/Http/Controllers'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/Http/Controllers/LoginController.php'), '<?php\nclass LoginController {}\n');
  const found = (await analyzeProject(root)).detectors['auth.2fa']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** Lychee signs people in with passkeys through laragear/webauthn and read as having no second factor. */
describe('laragear/webauthn', () => {
  it('is a second factor', async () => {
    expect(await secondFactor({ 'laragear/webauthn': '^3.0' })).toBe(true);
  });

  it('is not Laravel on its own', async () => {
    expect(await secondFactor({})).toBe(false);
  });
});
