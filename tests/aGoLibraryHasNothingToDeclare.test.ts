import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A Go library has nothing more to declare.
 *
 * `spf13/cobra` came out `partial` three times over for things Go does not have: types to
 * declare (the language is typed), a licence field (go.mod has none; pkg.go.dev reads the
 * LICENSE file), and a test script (`go test` exists the moment go.mod does). Every Go
 * library anywhere would have read the same.
 */
describe('a Go library has nothing more to declare', () => {
  it('is typed by its language, licensed by its file, and tested by its toolchain', async () => {
    const analysis = await analyzeProject(fixture('a-go-library'));

    expect(analysis.detectors['packaging.entrypoints']?.complete).toBe(true);
    expect(analysis.detectors['packaging.license']?.complete).toBe(true);
    expect(analysis.detectors['quality.tests']?.complete).toBe(true);
  });
});
