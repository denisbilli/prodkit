import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-lnbits-'));
  for (const [name, content] of Object.entries({ 'pyproject.toml': '[project]\nname = "lnbits"\ndependencies = ["fastapi>=0.110"]\n', ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/**
 * lnbits' French translation says `currency: 'Devise'`, which was a password reset, and
 * its `def register(self, extension)` registry was its onboarding.
 */
describe('lnbits', () => {
  it('Devise in a French translation is not the Rails gem', async () => {
    const analysis = await analyze({ 'lnbits/static/i18n/fr.js': "window.localisation.fr = {\n  currency: 'Devise',\n}\n" });

    expect(analysis.detectors['auth.passwordReset']?.present).toBe(false);
  });

  it('Devise in Ruby is still the gem', async () => {
    const analysis = await analyze({ 'config/routes.rb': 'Rails.application.routes.draw do\n  devise_for :users\nend\n' });

    expect(analysis.detectors['auth.passwordReset']?.present).toBe(true);
  });

  it('a registry method is not a sign-up', async () => {
    const analysis = await analyze({ 'lnbits/core/models/misc_service.py': 'class Extensions:\n    def register(self, extension) -> None:\n        self.items.append(extension)\n' });

    expect(analysis.detectors['onboarding.flow']?.present).toBe(false);
  });

  it('a view called register is', async () => {
    const analysis = await analyze({ 'lnbits/core/views/auth_service.py': 'async def register(request: Request, data: RegisterUser):\n    return await create_user(data)\n' });

    expect(analysis.detectors['onboarding.flow']?.present).toBe(true);
  });
});
