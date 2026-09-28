import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function validation(controller: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-wikijs-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'wiki', dependencies: { express: '4.19.0', multer: '1.4.5' } }));
  await fs.mkdir(path.join(root, 'server/controllers'), { recursive: true });
  await fs.writeFile(path.join(root, 'server/controllers/upload.js'), controller);
  const found = (await analyzeProject(root)).detectors['uploads.exposure']?.details?.validation;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** wiki.js caps every upload with multer's own size limit and read as unvalidated. */
describe("busboy's size limit", () => {
  it('is validation in multer options across lines', async () => {
    expect(await validation("const multer = require('multer')\nrouter.post('/u', multer({\n  limits: {\n    fileSize: WIKI.config.uploads.maxFileSize\n  }\n}).array('mediaUpload'))\n")).toBe(true);
  });

  it('is validation in multer options on one line', async () => {
    expect(await validation("import multer from 'multer'\nexport const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } })\n")).toBe(true);
  });

  it('is not a fileSize outside the limits', async () => {
    expect(await validation("const multer = null\nexport const props = { fileSize: 0 }\n")).toBe(false);
  });
});
