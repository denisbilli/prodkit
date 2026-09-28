import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(deps: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-hedgedoc-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'backend', dependencies: { '@nestjs/platform-fastify': '11.0.0', ...deps } }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/app-init.ts'), 'export async function setupApp(app) {\n  await app.register(plugin);\n}\n');
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/** hedgedoc takes note images through Fastify's own multipart plugin and read as taking none. */
describe('@fastify/multipart', () => {
  it('is an upload', async () => {
    const analysis = await analyze({ '@fastify/multipart': '10.1.1' });

    expect(analysis.detectors['uploads.exposure']?.present).toBe(true);
  });

  it('is not Fastify on its own', async () => {
    const analysis = await analyze({ '@fastify/cookie': '11.0.2' });

    expect(analysis.detectors['uploads.exposure']?.present).toBe(false);
  });
});
