import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function tenancy(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-docmost-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'server', dependencies: { '@nestjs/core': '10.0.0', kysely: '0.27.0' } }));
  const all = { 'src/pages/page.service.ts': 'export const list = (db, workspaceId) => db.selectFrom("pages").where("workspace_id", "=", workspaceId);\n', ...files };
  for (const [name, content] of Object.entries(all)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const found = (await analyzeProject(root)).detectors;
  await fs.rm(root, { recursive: true, force: true });
  return { organization: found['tenancy.organization'], membership: found['tenancy.membership'] };
}

const kysely = (unique: string, table = 'users') => `export async function up(db) {\n  await db.schema\n    .createTable('${table}')\n    .addColumn('email', 'varchar')\n    .addColumn('workspace_id', 'uuid')\n    ${unique}\n    .execute();\n}\n`;

/** docmost scopes every table by workspace, and its users table makes an address unique only within one. */
describe('An address unique only within a tenant', () => {
  it('makes the tenant in a Kysely migration', async () => {
    const found = await tenancy({ 'src/migrations/users.ts': kysely(".addUniqueConstraint('users_email_workspace_id_unique', [\n      'email',\n      'workspace_id',\n    ])") });
    expect(found.organization?.present).toBe(true);
    expect(found.membership?.present).toBe(true);
    expect(found.organization?.evidence.some((e) => e.file === 'src/pages/page.service.ts')).toBe(true);
  });

  it('makes the tenant in a knex migration, tenant first', async () => {
    const found = await tenancy({ 'src/migrations/users.ts': "exports.up = (knex) => knex.schema.createTable('users', (t) => {\n  t.string('email');\n  t.uuid('workspace_id');\n  t.unique(['workspace_id', 'email']);\n});\n" });
    expect(found.organization?.present).toBe(true);
  });

  it('makes the tenant in a Prisma User', async () => {
    const found = await tenancy({ 'prisma/schema.prisma': 'model User {\n  id          String @id\n  email       String\n  workspaceId String\n  @@unique([email, workspaceId])\n}\n' });
    expect(found.organization?.present).toBe(true);
  });

  it('makes the tenant in a Prisma User, tenant first', async () => {
    const found = await tenancy({ 'prisma/schema.prisma': 'model User {\n  id          String @id\n  email       String\n  workspaceId String\n  @@unique([workspaceId, email])\n}\n' });
    expect(found.organization?.present).toBe(true);
  });

  it('is nothing where the address is unique everywhere', async () => {
    const found = await tenancy({ 'src/migrations/users.ts': kysely(".addUniqueConstraint('users_email_unique', ['email'])") });
    expect(found.organization?.present).toBe(false);
  });

  it("is nothing on a table that is not the users'", async () => {
    const found = await tenancy({ 'src/migrations/subscribers.ts': kysely(".addUniqueConstraint('subscribers_email_workspace_id_unique', ['email', 'workspace_id'])", 'subscribers') });
    expect(found.organization?.present).toBe(false);
  });
});
