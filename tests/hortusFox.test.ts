import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function reset(routes: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-hortusfox-'));
  await fs.writeFile(path.join(root, 'composer.json'), '{"require":{"danielbrendel/asatru-php-framework":"^1.5","phpmailer/phpmailer":"^6.1"}}\n');
  await fs.mkdir(path.join(root, 'app/config'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/config/routes.php'), routes);
  const found = (await analyzeProject(root)).detectors['auth.passwordReset']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** HortusFox resets passwords at `/password/reset` and read as having no reset. */
describe('A reset path in two segments', () => {
  it('is a password reset', async () => {
    expect(await reset("<?php\nreturn [\n    array('/password/restore', 'POST', 'index@restore_password'),\n    array('/password/reset', 'GET', 'index@view_reset_password'),\n];\n")).toBe(true);
  });

  it('is not a password route of another kind', async () => {
    expect(await reset("<?php\nreturn [\n    array('/password/change', 'POST', 'profile@change_password'),\n];\n")).toBe(false);
  });
});

/** HortusFox mails through its framework's SMTPMailer, a PHPMailer it declares in Composer. */
describe('PHPMailer declared in Composer', () => {
  it('is a way to send mail', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-hortusfox-'));
    await fs.writeFile(path.join(root, 'composer.json'), '{"require":{"phpmailer/phpmailer":"^6.1"}}\n');
    await fs.mkdir(path.join(root, 'app/models'), { recursive: true });
    await fs.writeFile(path.join(root, 'app/models/UserModel.php'), '<?php\n$mailobj = new Asatru\\SMTPMailer\\SMTPMailer();\n');
    const found = (await analyzeProject(root)).detectors['notifications.transactional']?.details?.emailDependency;
    await fs.rm(root, { recursive: true, force: true });

    expect(found).toBe(true);
  });
});
