import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { searchInFiles } from '../src/utils/textSearch';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

async function project(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-self-'));
  for (const [file, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), content);
  }
  return root;
}

/**
 * Pointed at itself, this analyzer read its own detector tables as a payment
 * integration, an authentication system and a set of security headers, and awarded
 * itself passing checks for all three. Not a self-analysis quirk: every linter, scanner
 * and security tool carries a table of the things it looks for.
 */
describe('a string is not the thing it names', () => {
  it('does not read a pattern table as an integration', async () => {
    const root = await project({
      'package.json': '{"name":"scanner","version":"1.0.0","main":"index.js"}',
      'src/patterns.js': "const SECRETS = [\n  /STRIPE_WEBHOOK_SECRET/,\n  /stripeCustomerId/i,\n];\nmodule.exports = { SECRETS };\n",
    });

    const hits = await searchInFiles(root, ['src/patterns.js'], [/STRIPE_WEBHOOK_SECRET/, /stripeCustomerId/i]);
    expect(hits).toEqual([]);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not read a comment as behaviour', async () => {
    // This file's own comments, written to explain the trap, were themselves counted as
    // evidence that the package takes payments.
    const root = await project({
      'src/notes.js': "// We used to use STRIPE_WEBHOOK_SECRET here.\n/* stripeCustomerId was removed */\nmodule.exports = {};\n",
    });

    const hits = await searchInFiles(root, ['src/notes.js'], [/STRIPE_WEBHOOK_SECRET/, /stripeCustomerId/i]);
    expect(hits).toEqual([]);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('still reads a string in a list, because there it is the behaviour', async () => {
    // Skipping standalone string entries removed `'django.contrib.auth',` from an
    // INSTALLED_APPS list. Assessed checks on a real Django project fell from
    // thirty-three to ten and its score rose eight points for being less legible.
    const root = await project({
      'settings.py': "INSTALLED_APPS = [\n    'django.contrib.auth',\n    'django.contrib.sessions',\n]\n",
    });

    const hits = await searchInFiles(root, ['settings.py'], [/django\.contrib\.auth/]);
    expect(hits.length).toBeGreaterThan(0);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not count a line that both declares and uses', async () => {
    const root = await project({
      'src/app.js': "if (/STRIPE_WEBHOOK_SECRET/.test(process.env.KEYS)) { charge(); }\n",
    });

    const hits = await searchInFiles(root, ['src/app.js'], [/STRIPE_WEBHOOK_SECRET/]);
    expect(hits.length).toBeGreaterThan(0);

    await fs.rm(root, { recursive: true, force: true });
  });
});

/**
 * Seven observed rules reported `passed` for a package where the honest answer is that
 * the question has no subject — and each one counted towards the checks the report says
 * it verified, which is the number that exists to stop an absence of findings reading as
 * quality.
 */
describe('a question about users needs a subject', () => {
  const questions = ['auth.core', 'authz.resource-level', 'gdpr.privacy', 'billing.webhook-signature', 'security.cors-origin'];

  it('does not credit a command-line package with any of them', async () => {
    const report = buildReport(await analyzeProject(fixture('pattern-scanner')), { profile: 'library' });

    for (const id of questions) {
      const finding = report.findings.find((f) => f.id === id);
      expect(finding?.status, `${id} was answered for a package`).not.toBe('passed');
    }
  });

  it('does not credit a phone application with them either', async () => {
    const report = buildReport(await analyzeProject(fixture('flutter-app')), { profile: 'mobile-app' });

    for (const id of questions) {
      expect(report.findings.find((f) => f.id === id)?.status, id).not.toBe('passed');
    }
  });

  it('still answers them for something that serves requests', async () => {
    const report = buildReport(await analyzeProject(fixture('express-secure')), { profile: 'b2b-saas' });
    const answered = questions.filter((id) => {
      const status = report.findings.find((f) => f.id === id)?.status;
      return status && status !== 'unknown';
    });

    expect(answered.length).toBeGreaterThan(0);
  });
});
