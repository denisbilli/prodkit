import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A Composer library's PHP is its language, not its backend.
 *
 * `slimphp/Slim` is `"type": "library"` with a PSR-4 autoload and came out with no
 * profile: nothing read composer.json as a package, and the backend detector's `php` —
 * the language, reported for any PHP that handles a request — was taken for a server.
 * Its only `AppFactory::create()` outside tests is inside an error message.
 */
describe('a Composer framework', () => {
  it('reads a Composer library as a library', async () => {
    const analysis = await analyzeProject(fixture('a-composer-framework'));

    expect(analysis.detectors['packaging.entrypoints']?.details?.composerPackage).toBe(true);
    expect(inferProductProfile(analysis).inferredProfile).toBe('library');
  });

  /** `"type": "project"` that builds `$app = AppFactory::create()` is an application. */
  it('still reads a Slim application as not a library', async () => {
    const analysis = await analyzeProject(fixture('a-slim-application'));

    expect(analysis.detectors['stack.backend']?.details?.servedOutsideDocs).toBe(true);
    expect(inferProductProfile(analysis).inferredProfile).not.toBe('library');
  });
});
