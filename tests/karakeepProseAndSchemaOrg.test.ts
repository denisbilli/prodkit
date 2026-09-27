import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-karakeep-'));
  for (const [name, content] of Object.entries({ 'package.json': JSON.stringify({ name: 'karakeep', dependencies: { next: '^15.0.0' } }), ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/**
 * karakeep's tagging prompt mentions "cookie consent" among page chrome to ignore, and its
 * landing page's schema.org Organization made it multi-tenant.
 */
describe('karakeep', () => {
  it('a sentence in a prompt template is not a consent record', async () => {
    const analysis = await analyze({
      'packages/shared/prompts.ts': 'export const prompt = `\nAnalyze the attached page and suggest tags.\n    - Boilerplate content such as cookie consent, login walls, GDPR notices, navigation menus, or a blank page\n`;\n',
    });

    expect(analysis.detectors['gdpr.consent.route']?.present).toBe(false);
  });

  it('the same words in code are still read', async () => {
    const analysis = await analyze({ 'packages/shared/consent.ts': 'export const cookieConsent = readCookie("cookie-consent");\n' });

    expect(analysis.detectors['gdpr.consent.route']?.present).toBe(true);
  });

  it("a schema.org Organization is the publisher, not a tenant", async () => {
    const analysis = await analyze({
      'apps/landing/src/pages/index.ts': 'const ORGANIZATION_ID = `${BASE_URL}/#organization`;\nexport const ld = {\n  "@context": "https://schema.org",\n  "@id": ORGANIZATION_ID,\n  organizationId: ORGANIZATION_ID,\n};\n',
    });

    expect(analysis.detectors['tenancy.organization']?.present).toBe(false);
  });
});
