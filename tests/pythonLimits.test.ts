import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function rateLimit(requirements: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-indico-'));
  await fs.writeFile(path.join(root, 'requirements.txt'), requirements);
  await fs.mkdir(path.join(root, 'indico/core'), { recursive: true });
  await fs.writeFile(path.join(root, 'indico/core/app.py'), 'from flask import Flask\napp = Flask(__name__)\n');
  const found = (await analyzeProject(root)).detectors['security.core']?.details?.rateLimit;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** indico builds its limiter on `limits` and read as limiting nothing. */
describe('The limits package', () => {
  it('is a rate limit', async () => {
    expect(await rateLimit('flask==3.1\nlimits==5.8.0\n')).toBe(true);
  });

  it('is not Flask on its own', async () => {
    expect(await rateLimit('flask==3.1\n')).toBe(false);
  });
});
