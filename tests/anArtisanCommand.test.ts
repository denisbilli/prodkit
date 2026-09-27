import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function exportFrom(file: string, code: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-coolify-'));
  await fs.writeFile(path.join(root, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^12.0' } }));
  await fs.mkdir(path.join(root, path.dirname(file)), { recursive: true });
  await fs.writeFile(path.join(root, file), code);
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['gdpr.export.route']?.present;
}

const COMMAND = '<?php\n\nnamespace App\\Console\\Commands\\Cloud;\n\nuse Illuminate\\Console\\Command;\n\nclass ExportUsers extends Command\n{\n    protected $signature = "cloud:export-users";\n}\n';

/** coolify's operator dumps every user with an Artisan command, and that was its data export. */
describe('an Artisan command', () => {
  it('is the operator, not the person the data describes', async () => {
    expect(await exportFrom('app/Console/Commands/Cloud/ExportUsers.php', COMMAND)).toBe(false);
  });

  it('is only a class that extends the console command', async () => {
    expect(await exportFrom('app/Http/Controllers/ExportUsers.php', '<?php\n\nclass ExportUsers extends Controller\n{\n}\n')).toBe(true);
  });

  it('is a Symfony console command too', async () => {
    expect(await exportFrom('src/Command/ExportUsersCommand.php', '<?php\n\nuse Symfony\\Component\\Console\\Command\\Command;\n\nclass ExportUsersCommand extends Command\n{\n}\n')).toBe(false);
  });

  it('is not a class of the same name from somewhere else', async () => {
    expect(await exportFrom('app/Support/ExportUsers.php', '<?php\n\nuse App\\Support\\Command;\n\nclass ExportUsers extends Command\n{\n}\n')).toBe(true);
  });

  it('is not a file that only reads the console command constants', async () => {
    expect(await exportFrom('app/Http/Controllers/ExportUsers.php', '<?php\n\nuse Illuminate\\Console\\Command;\n\nclass ExportUsers extends Controller\n{\n    public $ok = Command::SUCCESS;\n}\n')).toBe(true);
  });
});
