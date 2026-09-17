import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function project(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-fp-'));

  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }

  return root;
}

/**
 * Every case here is taken from `usebruno/bruno`, a desktop API client with no
 * accounts, no tenants and no payments, which this analyzer classified as a B2B SaaS
 * with high confidence. Three separate words did it, and each one meant something else.
 */
describe('words that mean something else', () => {
  it('does not read an Apple Team ID as a tenant boundary', async () => {
    const root = await project({
      'package.json': '{"name":"app","dependencies":{"express":"^4.0.0"}}',
      'notarize.js': `const teamId = 'W7LPPWA48L';\nmodule.exports = { ascProvider: teamId, teamId };\n`,
    });

    const analysis = await analyzeProject(root);

    expect(analysis.detectors['tenancy.organization']?.present).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not read a CSS colour token as a payment processor', async () => {
    const root = await project({
      'package.json': '{"name":"app","dependencies":{"express":"^4.0.0"}}',
      'theme.js': `module.exports = { 'table-stripe': '#f3f3f3' };\n`,
    });

    const analysis = await analyzeProject(root);

    expect(analysis.detectors['billing.stripe']?.present).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not read the name of an API in a list as billing', async () => {
    const root = await project({
      'package.json': '{"name":"app","dependencies":{"express":"^4.0.0"}}',
      'Overview.jsx': `export const items = ['Stripe API', 'GitHub REST', 'Internal Auth'];\n`,
    });

    const analysis = await analyzeProject(root);

    // Writing the word is talking about Stripe. Charging people leaves a dependency, a
    // STRIPE_ variable, a customer id or a webhook path.
    expect(analysis.detectors['billing.stripe']?.present).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not read a local workspace as a customer boundary', async () => {
    const root = await project({
      'package.json': '{"name":"app","dependencies":{"express":"^4.0.0"}}',
      'a.js': `let workspaceId = 'default';\n`,
      'b.js': `export const build = (resources, workspaceId) => resources;\n`,
      'c.js': `const isBase = (env) => env.parentId === workspaceId;\n`,
    });

    const analysis = await analyzeProject(root);

    // Three files, and still not tenancy: an API client has workspaces and they are
    // folders. A tenant boundary is named somewhere by a word that means only that.
    expect(analysis.detectors['tenancy.organization']?.present).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('still recognises the real thing', async () => {
    const root = await project({
      'package.json': '{"name":"app","dependencies":{"express":"^4.0.0","stripe":"^14.0.0"}}',
      'server.js': `const organizationId = req.user.organizationId;\nconst workspaceId = req.params.workspaceId;\n`,
    });

    const analysis = await analyzeProject(root);

    expect(analysis.detectors['tenancy.organization']?.present).toBe(true);
    expect(analysis.detectors['billing.stripe']?.present).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });
});
