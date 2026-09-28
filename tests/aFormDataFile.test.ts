import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(route: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-dub-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"dependencies":{"next":"15.0.0"}}\n');
  await fs.mkdir(path.join(root, 'app/api/import/csv'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/api/import/csv/route.ts'), route);
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/** dub imports links from an uploaded CSV through the web platform's FormData. */
describe('A FormData field read as a File', () => {
  it('is an upload', async () => {
    const analysis = await analyze(
      'export async function POST(req: Request) {\n  const formData = await req.formData();\n  const file = formData.get("file") as File;\n  return Response.json({ size: file.size });\n}\n',
    );

    expect(analysis.detectors['uploads.exposure']?.present).toBe(true);
  });

  it('is not a FormData field read as a string', async () => {
    const analysis = await analyze(
      'export async function POST(req: Request) {\n  const formData = await req.formData();\n  const folderId = formData.get("folderId") as string;\n  return Response.json({ folderId });\n}\n',
    );

    expect(analysis.detectors['uploads.exposure']?.present).toBe(false);
  });
});
