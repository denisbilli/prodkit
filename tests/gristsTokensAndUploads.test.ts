import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(deps: Record<string, string>, files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-grist-'));
  for (const [name, content] of Object.entries({ 'package.json': JSON.stringify({ name: 'grist', dependencies: { express: '^4.19.0', ...deps } }), ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/**
 * grist's token field resets its selection with `_resetTokenSelection`, and that was a
 * password reset; it parses attachment uploads with multiparty and read as taking none.
 */
describe('grist', () => {
  it('has no password reset in a method that resets a selection', async () => {
    const analysis = await analyze({}, { 'app/client/lib/TokenField.ts': 'class TokenField {\n  private _resetTokenSelection(token: Token | null) {}\n}\n' });

    expect(analysis.detectors['auth.passwordReset']?.present).toBe(false);
  });

  it('still reads a reset token', async () => {
    const analysis = await analyze({}, { 'app/server/auth.ts': 'const resetToken = crypto.randomBytes(32).toString("hex");\n' });

    expect(analysis.detectors['auth.passwordReset']?.present).toBe(true);
  });

  it('takes uploads through multiparty', async () => {
    const analysis = await analyze({ multiparty: '4.3.0' }, { 'app/server/uploads.ts': 'import * as multiparty from "multiparty";\n' });

    expect(analysis.detectors['uploads.exposure']?.present).toBe(true);
  });

  it('signs people in through OpenID Connect, with no password to reset', async () => {
    const analysis = await analyze({ 'openid-client': '5.6.1' }, { 'app/server/lib/OIDCConfig.ts': 'import { Issuer } from "openid-client";\n' });

    expect(analysis.detectors['auth.externalIdentityOnly']?.present).toBe(true);
  });

  it('signs people in through SAML, with no password to reset', async () => {
    const analysis = await analyze({ 'saml2-js': '4.0.2' }, { 'app/server/lib/SamlConfig.ts': 'import * as saml2 from "saml2-js";\n' });

    expect(analysis.detectors['auth.externalIdentityOnly']?.present).toBe(true);
  });
});
