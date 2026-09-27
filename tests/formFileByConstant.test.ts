import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

/** focalboard reads its uploads with `r.FormFile(UploadFormFileKey)` and read as taking none. */
describe('FormFile with the field named by a constant', () => {
  it('is an upload', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-focalboard-'));
    await fs.writeFile(path.join(root, 'go.mod'), 'module github.com/mattermost/focalboard/server\n\ngo 1.21\n');
    await fs.mkdir(path.join(root, 'server/api'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'server/api/files.go'),
      'package api\n\nconst UploadFormFileKey = "file"\n\nfunc (a *API) handleUploadFile(w http.ResponseWriter, r *http.Request) {\n\tfile, handle, err := r.FormFile(UploadFormFileKey)\n\t_ = file\n\t_ = handle\n\t_ = err\n}\n',
    );
    const analysis = await analyzeProject(root);
    await fs.rm(root, { recursive: true, force: true });

    expect(analysis.detectors['uploads.exposure']?.present).toBe(true);
  });
});
