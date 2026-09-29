import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function uploads(handler: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-audiobookshelf-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'audiobookshelf', dependencies: { express: '4.19.0' } }));
  await fs.mkdir(path.join(root, 'server/managers'), { recursive: true });
  await fs.writeFile(path.join(root, 'server/managers/BackupManager.js'), handler);
  const found = (await analyzeProject(root)).detectors['uploads.exposure']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** audiobookshelf takes covers, backups and audiobooks from `req.files`. */
describe("Express's req.files", () => {
  it('is an upload', async () => {
    expect(await uploads('async function uploadBackup(req, res) {\n  const backupFile = req.files.file\n  await backupFile.mv(tempPath)\n}\n')).toBe(true);
  });

  it('is not req.file names in a request body', async () => {
    expect(await uploads('async function rename(req, res) {\n  const names = req.body.filenames\n  res.json({ names })\n}\n')).toBe(false);
  });
});
