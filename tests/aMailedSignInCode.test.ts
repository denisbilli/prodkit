import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function detectors(deps: Record<string, string>, files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-cap-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'web', dependencies: { next: '15.0.0', ...deps } }));
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const found = (await analyzeProject(root)).detectors;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

const login = { 'proxy.ts': 'export function isPublic(path: string) {\n  return path.startsWith("/login") || path.startsWith("/verify-otp");\n}\n' };

/** Cap signs people in with a mailed code and holds no password, and that sign-in was its second factor. */
describe('A code mailed to sign in', () => {
  it('is not a second factor where no password is kept', async () => {
    const found = await detectors({ 'next-auth': '4.24.0' }, login);
    expect(found['auth.2fa']?.present).toBe(false);
  });

  it('leaves TOTP a second factor on top of it', async () => {
    const found = await detectors({ 'next-auth': '4.24.0' }, { 'app/mfa.server.ts': 'export async function validate(code: string, user) {\n  return verifyTotp(user.secret, code);\n}\nconst method: "totp" | "recovery" = "totp";\n' });
    expect(found['auth.2fa']?.present).toBe(true);
  });

  it('leaves Two-Factor settings a second factor on top of it', async () => {
    const found = await detectors({ 'next-auth': '4.24.0' }, { 'app/preferences.ts': 'export const section = { title: "Two-Factor Authentication" };\n' });
    expect(found['auth.2fa']?.present).toBe(true);
  });

  it('reads two_factor in snake case too', async () => {
    const found = await detectors({ 'next-auth': '4.24.0' }, { 'app/settings.ts': 'export const flags = { two_factor_enabled: true };\n' });
    expect(found['auth.2fa']?.present).toBe(true);
  });

  it('does not read totp inside another word', async () => {
    const found = await detectors({ 'next-auth': '4.24.0' }, { 'app/login.ts': 'export function sent(setOtpSent, verifyOtp) {\n  setOtpSent(true);\n  return verifyOtp;\n}\n' });
    expect(found['auth.2fa']?.present).toBe(false);
  });

  it('is still one beside a password', async () => {
    const found = await detectors({ 'next-auth': '4.24.0', bcryptjs: '2.4.3' }, login);
    expect(found['auth.2fa']?.present).toBe(true);
  });
});

/** Cap runs video processing and AI generation as Workflow DevKit steps and read as doing no background work. */
describe("Vercel's workflow package", () => {
  it('is background work', async () => {
    expect((await detectors({ workflow: '4.6.0' }, {}))['jobs.background']?.present).toBe(true);
  });

  it('is not Next.js on its own', async () => {
    expect((await detectors({}, {}))['jobs.background']?.present).toBe(false);
  });
});
