import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-photoview-'));
  for (const [name, content] of Object.entries({ 'ui/package.json': '{"name":"ui","dependencies":{"react":"^18.2.0"}}', ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

const REGISTRATION = [
  'export function register(config?: Config) {',
  "  if ('serviceWorker' in navigator) {",
  '    navigator.serviceWorker',
  '      .register(swUrl)',
  '      .then((registration) => config?.onSuccess?.(registration))',
  '  }',
  '}',
  '',
].join('\n');

/**
 * photoview's users are created by an administrator, and Create React App's service
 * worker boilerplate — `export function register(config)` — was its onboarding.
 */
describe('a service worker registration', () => {
  it('is not a sign-up', async () => {
    const analysis = await analyze({ 'ui/src/serviceWorkerRegistration.ts': REGISTRATION });

    expect(analysis.detectors['onboarding.flow']?.present).toBe(false);
  });

  // vite-plugin-pwa's name for the same module, which says register and not worker.
  it('is not a sign-up when the file is named for it', async () => {
    const analysis = await analyze({ 'ui/src/registerSW.js': REGISTRATION });

    expect(analysis.detectors['onboarding.flow']?.present).toBe(false);
  });

  it('leaves a register route alone', async () => {
    const analysis = await analyze({ 'ui/src/routes.ts': "export const routes = [{ path: '/register', element: <Register /> }];\n" });

    expect(analysis.detectors['onboarding.flow']?.present).toBe(true);
  });
});
