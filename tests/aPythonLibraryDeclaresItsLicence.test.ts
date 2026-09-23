import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The licence field of every other manifest.
 *
 * `encode/httpx` declares `license = "BSD-3-Clause"` and the OSI classifier in its
 * pyproject.toml, beside LICENSE.md, and was told its licence was only half declared: the
 * declared half was read from package.json alone.
 */
describe('a Python library declares its licence', () => {
  it('reads PEP 621 and the classifier as the declaration', async () => {
    const analysis = await analyzeProject(fixture('a-python-library-declares-its-licence'));

    expect(analysis.detectors['packaging.license']?.complete).toBe(true);
  });

  /** A LICENSE file with nothing in the manifest is still half the answer. */
  it('still reads a file alone as partial', async () => {
    const analysis = await analyzeProject(fixture('a-python-library-with-only-a-file'));

    expect(analysis.detectors['packaging.license']?.present).toBe(true);
    expect(analysis.detectors['packaging.license']?.complete).toBe(false);
  });
});
