import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function exportIn(code: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-archivebox-'));
  await fs.writeFile(path.join(root, 'requirements.txt'), 'django==5.1\n');
  await fs.mkdir(path.join(root, 'app'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/views.py'), code);
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['gdpr.export.route']?.present;
}

/**
 * ArchiveBox copies a Chrome profile into a directory called `export_profile`, and that
 * string was its personal data export.
 */
describe('export_profile', () => {
  it('is not an export as a directory name', async () => {
    expect(await exportIn('launch_profile = stage / "export_profile"\n')).toBe(false);
  });

  it('is an export as a name in code', async () => {
    expect(await exportIn('def export_account(request):\n    return download(request.user)\n')).toBe(true);
  });

  it('is an export as a type name', async () => {
    expect(await exportIn('class SubscriberExportProfile:\n    pass\n')).toBe(true);
  });
});
