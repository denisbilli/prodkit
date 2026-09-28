import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function onboardingWith(file: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-saas-boilerplate-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'saas', dependencies: { next: '^15.0.0' } }));
  await fs.mkdir(path.join(root, path.dirname(file)), { recursive: true });
  await fs.writeFile(path.join(root, file), 'x');
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['onboarding.flow']?.present;
}

/** SaaS-Boilerplate's README screenshot of its sign-up page was its onboarding. */
describe('a picture of a sign-up page', () => {
  it('is not one', async () => {
    expect(await onboardingWith('public/assets/images/nextjs-boilerplate-saas-sign-up.png')).toBe(false);
  });

  it('a sign-up page is', async () => {
    expect(await onboardingWith('src/app/sign-up/page.tsx')).toBe(true);
  });
});
