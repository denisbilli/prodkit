import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function uploads(handler: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-photoprism-'));
  await fs.writeFile(path.join(root, 'go.mod'), 'module github.com/photoprism/photoprism\n\ngo 1.23\n\nrequire github.com/gin-gonic/gin v1.10.0\n');
  await fs.mkdir(path.join(root, 'internal/api'), { recursive: true });
  await fs.writeFile(path.join(root, 'internal/api/users_upload.go'), handler);
  const found = (await analyzeProject(root)).detectors['uploads.exposure']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** PhotoPrism takes every photo through Gin's multipart form and read as taking none. */
describe("Gin's SaveUploadedFile", () => {
  it('is an upload', async () => {
    expect(await uploads('package api\n\nfunc UploadUserFiles(c *gin.Context) {\n\tf, _ := c.MultipartForm()\n\tfor _, file := range f.File["files"] {\n\t\t_ = c.SaveUploadedFile(file, dest)\n\t}\n}\n')).toBe(true);
  });

  it('is not a handler that reads a form field', async () => {
    expect(await uploads('package api\n\nfunc Rename(c *gin.Context) {\n\tname := c.PostForm("name")\n\t_ = name\n}\n')).toBe(false);
  });
});
