import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function jobs(require: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-unkey-'));
  await fs.writeFile(path.join(root, 'go.mod'), `module example.com/ctrl\n\ngo 1.23\n\nrequire (\n\tgithub.com/go-chi/chi/v5 v5.1.0\n${require})\n`);
  await fs.writeFile(path.join(root, 'main.go'), 'package main\n\nfunc main() {}\n');
  const found = (await analyzeProject(root)).detectors['jobs.background']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** unkey runs deployments as Restate workflows and was reported as doing no work outside a request. */
describe('A Go queue or workflow engine', () => {
  for (const module of ['github.com/restatedev/sdk-go', 'github.com/hibiken/asynq', 'github.com/riverqueue/river', 'go.temporal.io/sdk']) {
    it(`is background work: ${module}`, async () => {
      expect(await jobs(`\t${module} v1.0.0\n`)).toBe(true);
    });
  }

  it('is not a router on its own', async () => {
    expect(await jobs('')).toBe(false);
  });
});
