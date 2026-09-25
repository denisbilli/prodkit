import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function project(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-policy-'));

  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }

  return root;
}

const erasure = async (files: Record<string, string>) => {
  const root = await project({ 'package.json': '{"name":"builder","dependencies":{"express":"^4.19.2"}}', ...files });
  const present = (await analyzeProject(root)).detectors['gdpr.erasure.route']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return present;
};

/**
 * appsmith was credited with exporting, erasing and expiring personal data on the
 * strength of two files that do none of it: a paragraph of its privacy policy, and a
 * test's helper full of plugin configurations with a `GDPR_DELETE` action in them.
 */
describe('a policy is not the code that honours it', () => {
  it('does not read a sentence of a privacy policy as erasure', async () => {
    expect(await erasure({
      'public/privacy-policy.html': '<p class="c4"><span class="c5">Users have the right to erasure: once the retention period expires, Personal Data shall be deleted on request.</span></p>\n',
    })).toBe(false);
  });

  /** A button is the interface to the feature, and two words are not a paragraph. */
  it('still reads a delete-account button in a template', async () => {
    expect(await erasure({
      'templates/settings.html': '<form method="post" action="/account/delete">\n  <button type="submit">Delete account</button>\n</form>\n',
    })).toBe(true);
  });

  it('does not read a test helper as the product', async () => {
    expect(await erasure({
      'src/modals/unitTestUtils.ts': 'export const actions = [{ label: "Delete user data", value: "GDPR_DELETE" }];\n',
    })).toBe(false);
  });
});
