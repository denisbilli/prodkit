import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The manifest that declares the licence is not always the one at the root.
 *
 * `packaging.license` read `packageJson.license` and nothing else, so excalidraw — a
 * LICENSE file at the root and `"license": "MIT"` in every one of its nine published
 * packages — came out `partial`, told to declare a licence it declares nine times. Its
 * root manifest is `private: true`: it is the workspace, not a package, and npm would
 * refuse to publish it. A manifest that is never published has no licence field to be
 * missing.
 */
describe('the licence is in the package', () => {
  it('reads it from the manifest that would be published', async () => {
    const analysis = await analyzeProject(fixture('the-licence-is-in-the-package'));
    const licence = analysis.detectors['packaging.license'];

    expect(licence?.present).toBe(true);
    expect(licence?.complete).toBe(true);
  });

  /**
   * With no LICENSE file to lean on, the workspace manifest is the only thing that can
   * answer. `monorepo-library` is a private root, no LICENSE, and `@example/core`
   * declaring MIT: present, because the package that ships says what its terms are, and
   * not complete, because a field alone tells a human nothing.
   *
   * This is the assertion the first one could not make. Written without it, removing the
   * workspace read left both tests passing — the fixture above was answering through the
   * private-root branch the whole time.
   */
  it('finds it where the only manifest naming it is a workspace', async () => {
    const analysis = await analyzeProject(fixture('monorepo-library'));
    const licence = analysis.detectors['packaging.license'];

    expect(licence?.present).toBe(true);
    expect(licence?.complete).toBe(false);
  });

  /**
   * And `private: true` excuses the missing field without supplying a licence. A
   * private root with no LICENSE and no field anywhere is unlicensed, and saying
   * otherwise is the one direction this must never move a verdict.
   */
  it('does not invent a licence for a private root that has none', async () => {
    const analysis = await analyzeProject(fixture('monorepo-with-frontend-and-backend-subfolders'));
    const licence = analysis.detectors['packaging.license'];

    expect(licence?.present).toBe(false);
  });
});
