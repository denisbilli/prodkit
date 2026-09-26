import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function externalOnly(deps: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-remix-auth-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'jobs', dependencies: { '@remix-run/node': '^2.0.0', 'remix-auth': '^3.6.0', ...deps } }));
  await fs.mkdir(path.join(root, 'app/services'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/services/auth.server.ts'), 'export const authenticator = new Authenticator(sessionStorage);\n');
  const present = (await analyzeProject(root)).detectors['auth.externalIdentityOnly']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return present;
}

/**
 * trigger.dev signs people in with a mailed link, GitHub or Google through remix-auth,
 * hashes no password, and was told at `high` to build a password reset flow.
 */
describe('remix-auth strategies that hold no password', () => {
  it('reads an email-link and OAuth sign-in as identity held elsewhere', async () => {
    expect(await externalOnly({ 'remix-auth-email-link': '2.1.1', 'remix-auth-github': '^1.6.0' })).toBe(true);
  });

  /** A password hashed anywhere is a password somebody may need to reset. */
  it('still asks for a reset where a password is hashed', async () => {
    expect(await externalOnly({ 'remix-auth-email-link': '2.1.1', bcryptjs: '^2.4.3' })).toBe(false);
  });
});
