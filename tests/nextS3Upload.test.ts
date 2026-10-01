import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function uploads(deps: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-spliit-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'spliit', dependencies: { next: '15.0.0', ...deps } }));
  await fs.mkdir(path.join(root, 'src/app'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/app/page.tsx'), 'export default function Page() {\n  return null\n}\n');
  const found = (await analyzeProject(root)).detectors['uploads.exposure']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** spliit takes receipt images through next-s3-upload's signed route and read as taking none. */
describe('next-s3-upload', () => {
  it('is an upload', async () => {
    expect(await uploads({ 'next-s3-upload': '0.3.4' })).toBe(true);
  });

  it('is not Next.js on its own', async () => {
    expect(await uploads({})).toBe(false);
  });
});
