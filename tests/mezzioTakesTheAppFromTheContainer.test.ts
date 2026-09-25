import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function backend(run: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-mezzio-'));
  const files: Record<string, string> = {
    'composer.json': '{"name":"app/short","type":"project","require":{"mezzio/mezzio":"^3.0","symfony/console":"^7.0"}}',
    'config/run.php': run,
    'public/index.php': "<?php\n(require __DIR__ . '/../config/run.php')();\n",
  };
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const details = (await analyzeProject(root)).detectors['stack.backend']?.details;
  await fs.rm(root, { recursive: true, force: true });
  return details as { frameworks: string[]; servedOutsideDocs: boolean };
}

/**
 * shlink is a Mezzio API: its backend was reported as bare `php`, and the application
 * it runs — taken out of the container with `$container->get(Application::class)` — was
 * never seen being served.
 */
describe('Mezzio takes its application from the container', () => {
  it('names Mezzio and sees it served', async () => {
    const found = await backend("<?php\nuse Mezzio\\Application;\n\nreturn static function (): void {\n    $container = include __DIR__ . '/container.php';\n    $app = $container->get(Application::class);\n    $app->run();\n};\n");

    expect(found.frameworks).toContain('mezzio');
    expect(found.servedOutsideDocs).toBe(true);
  });

  /** `Application::class` is also Symfony Console's; a CLI is not a server. */
  it('does not read a console application as a served one', async () => {
    const found = await backend("<?php\nuse Symfony\\Component\\Console\\Application;\n\n$app = $container->get(Application::class);\n$app->run();\n");

    expect(found.servedOutsideDocs).toBe(false);
  });
});
