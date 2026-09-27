import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-appflowy-'));
  const cargo = '[package]\nname = "appflowy-cloud"\nversion = "0.1.0"\n\n[dependencies]\nactix-web = "4"\nactix-multipart = { version = "0.7.2", features = ["derive"] }\n';
  for (const [name, content] of Object.entries({ 'Cargo.toml': cargo, 'src/main.rs': 'fn main() {}\n', ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/**
 * AppFlowy Cloud takes uploads through actix-multipart and lets people delete their account
 * in src/biz/user/user_delete.rs, and was told it does neither.
 */
describe('AppFlowy Cloud', () => {
  it('takes uploads through actix-multipart', async () => {
    const analysis = await analyze({});

    expect(analysis.detectors['uploads.exposure']?.present).toBe(true);
  });

  it('deletes a user in user_delete.rs', async () => {
    const analysis = await analyze({ 'src/biz/user/user_delete.rs': 'pub async fn delete_user() {}\n' });

    expect(analysis.detectors['gdpr.erasure.route']?.present).toBe(true);
  });

  it('is not a word that merely ends in user_delete', async () => {
    const analysis = await analyze({ 'src/biz/admin/bulk_user_delete_log.rs': 'pub fn log() {}\n' });

    expect(analysis.detectors['gdpr.erasure.route']?.present).toBe(false);
  });
});
