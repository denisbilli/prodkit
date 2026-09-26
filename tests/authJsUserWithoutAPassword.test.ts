import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-papermark-'));
  const pkg = '{"name":"docs","dependencies":{"next":"^14.2.0","next-auth":"^4.24.0","@prisma/client":"^5.0.0","bcryptjs":"^2.4.3"}}';
  for (const [name, content] of Object.entries({ 'package.json': pkg, ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

const user = (columns: string) => `model User {\n  id String @id @default(cuid())\n  email String? @unique\n${columns}}\n`;

const LINK_PASSWORD = 'import bcrypt from "bcryptjs";\n\nexport async function hashPassword(password: string) {\n  return bcrypt.hash(password, 10);\n}\n';

/**
 * papermark signs people in through Auth.js with providers and a mailed link, hashes the
 * password a shared link can carry with bcryptjs, and was told at `high` to build a
 * password reset for accounts that have no password.
 */
describe('an Auth.js user without a password', () => {
  it('has no password to reset', async () => {
    const analysis = await analyze({
      'prisma/schema/schema.prisma': user('  accounts Account[]\n  sessions Session[]\n'),
      'lib/utils.ts': LINK_PASSWORD,
    });

    expect(analysis.detectors['auth.externalIdentityOnly']?.present).toBe(true);
  });

  it('has one when the user model keeps a hash', async () => {
    const analysis = await analyze({
      'prisma/schema/schema.prisma': user('  accounts Account[]\n  passwordHash String?\n'),
      'lib/utils.ts': LINK_PASSWORD,
    });

    expect(analysis.detectors['auth.externalIdentityOnly']?.present).toBe(false);
  });

  it('is only the adapter\'s user', async () => {
    const analysis = await analyze({
      'prisma/schema/schema.prisma': user('  sessions Session[]\n'),
      'lib/utils.ts': LINK_PASSWORD,
    });

    expect(analysis.detectors['auth.externalIdentityOnly']?.present).toBe(false);
  });
});
