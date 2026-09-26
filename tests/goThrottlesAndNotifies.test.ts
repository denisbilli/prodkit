import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(requires: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-remark42-'));
  await fs.writeFile(path.join(root, 'go.mod'), `module github.com/umputun/remark42/backend\n\ngo 1.23\n\nrequire (\n${requires}\n)\n`);
  await fs.mkdir(path.join(root, 'app'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/main.go'), 'package main\n\nfunc main() {}\n');
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/**
 * remark42 throttles its API with tollbooth and notifies commenters through
 * go-pkgz/notify, and was told at `high` it does neither.
 */
describe('remark42', () => {
  it('throttles with tollbooth, whatever its major version', async () => {
    const analysis = await analyze('\tgithub.com/didip/tollbooth/v8 v8.0.1');

    expect(analysis.detectors['security.core']?.details?.rateLimit).toBe(true);
  });

  it('notifies through go-pkgz/notify', async () => {
    const analysis = await analyze('\tgithub.com/go-pkgz/notify v1.5.0');

    expect(analysis.detectors['notifications.transactional']?.details?.emailDependency).toBe(true);
  });
});
