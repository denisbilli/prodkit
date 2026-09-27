import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-wallos-'));
  for (const [name, content] of Object.entries({ 'index.php': '<?php\nrequire_once "includes/connect.php";\n', ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/** Wallos mails through a vendored PHPMailer and signs people up at registration.php. */
describe('Wallos', () => {
  it('sends mail through PHPMailer', async () => {
    const analysis = await analyze({ 'endpoints/cronjobs/sendnotifications.php': '<?php\n\nuse PHPMailer\\PHPMailer\\PHPMailer;\n\n$mail = new PHPMailer(true);\n' });

    expect(analysis.detectors['notifications.transactional']?.details?.emailDependency).toBe(true);
  });

  it('signs people up at registration.php', async () => {
    const analysis = await analyze({ 'registration.php': '<?php\n$page = "form";\n' });

    expect(analysis.detectors['onboarding.flow']?.present).toBe(true);
  });

  /** Django's auth templates live in registration/, and babybuddy's are login pages. */
  it("is not Django's templates/registration/ directory", async () => {
    const analysis = await analyze({ 'babybuddy/templates/registration/login.html': '<form method="post">{% csrf_token %}</form>\n' });

    expect(analysis.detectors['onboarding.flow']?.present).toBe(false);
  });
});
