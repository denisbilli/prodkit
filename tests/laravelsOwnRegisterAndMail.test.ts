import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-pterodactyl-'));
  for (const [name, content] of Object.entries({ 'composer.json': JSON.stringify({ require: { 'laravel/framework': '^10.0' } }), ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/**
 * pterodactyl's service providers each define `register()`, which was its onboarding; its
 * `Illuminate\Notifications\Notification` classes were not read as a way to send mail.
 */
describe("Laravel's own words", () => {
  it('register() in a service provider is not a sign-up', async () => {
    const analysis = await analyze({
      'app/Providers/BackupsServiceProvider.php': '<?php\n\nnamespace Pterodactyl\\Providers;\n\nuse Illuminate\\Support\\ServiceProvider;\n\nclass BackupsServiceProvider extends ServiceProvider\n{\n    public function register(): void\n    {\n    }\n}\n',
    });

    expect(analysis.detectors['onboarding.flow']?.present).toBe(false);
  });

  it('a Notification class sends mail', async () => {
    const analysis = await analyze({
      'app/Notifications/ServerInstalled.php': '<?php\n\nnamespace Pterodactyl\\Notifications;\n\nuse Illuminate\\Notifications\\Notification;\n\nclass ServerInstalled extends Notification\n{\n}\n',
    });

    expect(analysis.detectors['notifications.transactional']?.details?.emailDependency).toBe(true);
  });

  it('a Mailable sends mail', async () => {
    const analysis = await analyze({
      'app/Mail/Welcome.php': '<?php\n\nnamespace App\\Mail;\n\nuse Illuminate\\Mail\\Mailable;\n\nclass Welcome extends Mailable\n{\n}\n',
    });

    expect(analysis.detectors['notifications.transactional']?.details?.emailDependency).toBe(true);
  });
});
