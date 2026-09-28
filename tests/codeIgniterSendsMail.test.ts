import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-codeigniter-'));
  for (const [name, content] of Object.entries({ 'composer.json': '{"require":{"codeigniter4/framework":"^4.5"}}\n', ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/** opensourcepos mails receipts and invoices through CodeIgniter's own Email class. */
describe('CodeIgniter mail', () => {
  it('sends mail through CodeIgniter\\Email\\Email', async () => {
    const analysis = await analyze({
      'app/Libraries/Email_lib.php': '<?php\n\nnamespace App\\Libraries;\n\nuse CodeIgniter\\Email\\Email;\n\nclass Email_lib\n{\n    public function __construct()\n    {\n        $this->email = new Email();\n    }\n}\n',
    });

    expect(analysis.detectors['notifications.transactional']?.details?.emailDependency).toBe(true);
  });

  it('is not another class named Email', async () => {
    const analysis = await analyze({
      'app/Models/Email.php': '<?php\n\nnamespace App\\Models;\n\nuse CodeIgniter\\Model;\n\nclass Email extends Model\n{\n}\n',
    });

    expect(analysis.detectors['notifications.transactional']?.details?.emailDependency).toBe(false);
  });
});
