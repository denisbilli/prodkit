import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function mail(helper: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-mautic-'));
  await fs.writeFile(path.join(root, 'composer.json'), '{"require":{"symfony/framework-bundle":"^6.4"}}\n');
  await fs.mkdir(path.join(root, 'app/bundles/EmailBundle/Helper'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/bundles/EmailBundle/Helper/MailHelper.php'), helper);
  const found = (await analyzeProject(root)).detectors['notifications.transactional']?.details?.emailDependency;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** Mautic sends everything through Symfony's MailerInterface and read as partial. */
describe("Symfony's Mailer", () => {
  it('is a way to send mail', async () => {
    expect(await mail('<?php\n\nnamespace Mautic\\EmailBundle\\Helper;\n\nuse Symfony\\Component\\Mailer\\MailerInterface;\n\nclass MailHelper\n{\n    public function __construct(private MailerInterface $mailer) {}\n}\n')).toBe(true);
  });

  it('is not another Symfony interface', async () => {
    expect(await mail('<?php\n\nuse Symfony\\Component\\HttpFoundation\\RequestStack;\n\nclass MailHelper\n{\n    public function __construct(private RequestStack $requests) {}\n}\n')).toBe(false);
  });
});
