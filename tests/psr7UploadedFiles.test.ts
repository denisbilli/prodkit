import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function uploads(controller: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-shaarli-'));
  await fs.writeFile(path.join(root, 'composer.json'), '{"require":{"slim/slim":"^4.0"}}\n');
  await fs.mkdir(path.join(root, 'application/front/controller/admin'), { recursive: true });
  await fs.writeFile(path.join(root, 'application/front/controller/admin/ImportController.php'), controller);
  const found = (await analyzeProject(root)).detectors['uploads.exposure']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** Shaarli imports a bookmarks file through PSR-7 and read as taking no uploads. */
describe("PSR-7's getUploadedFiles", () => {
  it('is an upload', async () => {
    expect(await uploads("<?php\nclass ImportController\n{\n    public function import($request, $response)\n    {\n        $file = ($request->getUploadedFiles() ?? [])['filetoupload'] ?? null;\n        return $response;\n    }\n}\n")).toBe(true);
  });

  it('is not a request read for its fields', async () => {
    expect(await uploads("<?php\nclass ImportController\n{\n    public function import($request, $response)\n    {\n        $data = $request->getParsedBody();\n        return $response;\n    }\n}\n")).toBe(false);
  });
});
