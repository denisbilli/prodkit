import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function mfa(files: Record<string, string>): Promise<boolean | undefined> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-otp-'));
  for (const [name, content] of Object.entries({ 'package.json': '{"name":"agent","dependencies":{"vue":"^3.4.0","express":"^4.19.2"}}', ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const present = (await analyzeProject(root)).detectors['auth.2fa']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return present;
}

/**
 * hoppscotch's desktop agent shows `{{ otpCode }}` for somebody to copy into the app it
 * is pairing with, and that page was the whole of its second factor. A second factor is
 * checked where the secret is.
 */
describe('a code on a screen is not a second factor', () => {
  it('does not read a one-time code shown in a component', async () => {
    expect(await mfa({
      'src/pages/otp.vue': '<template>\n  <p class="code">{{ otpCode }}</p>\n</template>\n<script setup lang="ts">\nconst otpCode = ref("")\n</script>\n',
    })).toBe(false);
  });

  it('still reads one verified on the server', async () => {
    expect(await mfa({
      'src/server/login.ts': 'export async function secondStep(user: User, code: string) {\n  if (!verifyTotp(user.otpSecret, code)) throw new Unauthorized();\n}\n',
    })).toBe(true);
  });

  /** The words "two-factor" on a page are a page for a feature somebody built. */
  it('still reads a two-factor settings page', async () => {
    expect(await mfa({
      'src/pages/security.vue': '<template>\n  <h2>Two-factor authentication</h2>\n</template>\n',
    })).toBe(true);
  });

  /**
   * lldap's user model keeps a `totp_secret` column that nothing reads back: no TOTP
   * library, no code checked at sign-in. A place for a secret is not a check against it.
   */
  it('does not read a stored secret column nobody verifies', async () => {
    expect(await mfa({
      'src/model/users.rs': 'pub struct Model {\n    pub user_id: String,\n    pub totp_secret: Option<String>,\n}\n',
      'src/model/columns.rs': 'pub enum Column {\n    UserId,\n    TotpSecret,\n}\n',
    })).toBe(false);
  });
});

