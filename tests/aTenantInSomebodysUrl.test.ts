import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function tenancyFrom(line: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-changedetection-'));
  await fs.writeFile(path.join(root, 'requirements.txt'), 'flask==3.0\nflask-login==0.6\n');
  await fs.mkdir(path.join(root, 'app'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/notifications.py'), `${line}\n`);
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['tenancy.organization']?.present;
}

/** changedetection documents Apprise's `o365://TenantID:...` target and read as multi-tenant. */
describe("a tenant in somebody's URL format", () => {
  it('is theirs', async () => {
    expect(await tenancyFrom('HELP = "Office365 - o365://TenantID:AccountEmail/ClientID/ClientSecret/TargetEmail"')).toBe(false);
  });

  it('is still ours outside a URL', async () => {
    expect(await tenancyFrom('rows = Watch.query.filter_by(tenant_id=current_user.tenant_id).all()')).toBe(true);
  });
});
