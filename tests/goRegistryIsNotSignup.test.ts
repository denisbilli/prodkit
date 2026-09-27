import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function onboardingFrom(code: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-navidrome-'));
  await fs.writeFile(path.join(root, 'go.mod'), 'module github.com/navidrome/navidrome\n\ngo 1.23\n');
  await fs.mkdir(path.join(root, 'plugins/taskworker'), { recursive: true });
  await fs.writeFile(path.join(root, 'plugins/taskworker/worker_service.go'), `package taskworker\n\n${code}\n`);
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['onboarding.flow']?.present;
}

/** navidrome's plugin kit has `func Register(impl TaskWorker)`, and that was its onboarding. */
describe('a Go func called Register', () => {
  it('is a registry, not a sign-up', async () => {
    expect(await onboardingFrom('func Register(impl TaskWorker) {\n\tworkers = append(workers, impl)\n}')).toBe(false);
  });

  it('is a sign-up when it answers a request', async () => {
    expect(await onboardingFrom('func Register(w http.ResponseWriter, r *http.Request) {\n\tcreateUser(r)\n}')).toBe(true);
  });
});
