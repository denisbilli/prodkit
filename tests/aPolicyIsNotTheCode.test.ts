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

  /**
   * rallly's privacy policy and DPA are TSX pages, wrapped by Prettier at eighty columns
   * so no line is a whole sentence. Their headings and fragments were the export and the
   * retention policy.
   */
  it('does not read a legal page written as a component', async () => {
    const paragraph = Array.from({ length: 12 }, (_, i) =>
      `            and the right to data portability, erasure and restriction of processing ${i}`).join('\n');
    const root = await project({
      'package.json': '{"name":"polls","dependencies":{"next":"^15.0.0","react":"^19.0.0"}}',
      'app/privacy/page.tsx': `export default function Page() {\n  return (\n    <article>\n      <h2>Retention of personal data</h2>\n      <p>\n${paragraph}\n      </p>\n    </article>\n  );\n}\n`,
    });
    const analysis = await analyzeProject(root);
    await fs.rm(root, { recursive: true, force: true });

    expect(analysis.detectors['gdpr.export.route']?.present).toBe(false);
    expect(analysis.detectors['gdpr.retention.job']?.present).toBe(false);
  });

  /** What rallly does do: purge what was marked deleted a week ago. */
  it('still reads the job that deletes after a number of days', async () => {
    const root = await project({
      'package.json': '{"name":"polls","dependencies":{"next":"^15.0.0","@prisma/client":"^6.0.0"}}',
      'src/poll/mutations.ts': `export async function removeDeletedPolls() {\n  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);\n\n  while (true) {\n    const batch = await prisma.poll.findMany({\n      where: {\n        deleted: true,\n        deletedAt: {\n          lt: sevenDaysAgo,\n        },\n      },\n    });\n    if (batch.length === 0) break;\n    await prisma.poll.deleteMany({ where: { id: { in: batch.map((p) => p.id) } } });\n  }\n}\n`,
    });
    const analysis = await analyzeProject(root);
    await fs.rm(root, { recursive: true, force: true });

    expect(analysis.detectors['gdpr.retention.job']?.present).toBe(true);
  });
});

