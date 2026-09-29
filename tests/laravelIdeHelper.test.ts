import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function verification(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-heimdall-'));
  await fs.writeFile(path.join(root, 'composer.json'), '{"require":{"laravel/framework":"^11.0"},"require-dev":{"barryvdh/laravel-ide-helper":"^3.0"}}\n');
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const found = (await analyzeProject(root)).detectors['auth.emailVerification']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

const stub = '<?php\nnamespace Illuminate\\Support\\Facades {\n    class Route {\n        public static function emailVerification()\n        {\n            return \\Illuminate\\Routing\\Router::emailVerification();\n        }\n    }\n}\n';

/** Heimdall has no email, and laravel-ide-helper's stubs gave it email verification. */
describe("laravel-ide-helper's generated stubs", () => {
  it('are not the application', async () => {
    expect(await verification({ '_ide_helper.php': stub, 'routes/web.php': "<?php\nAuth::routes(['register' => false]);\n" })).toBe(false);
  });

  it('leave the same call in the application counted', async () => {
    expect(await verification({ 'routes/web.php': '<?php\nRoute::emailVerification();\n' })).toBe(true);
  });
});
