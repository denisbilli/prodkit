import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Clearing the line is not the same as winning.
 *
 * A package.json only loses to another manifest when JavaScript is under a twentieth
 * of the repository, which is the DuckDuckGo iOS case that rule was written for —
 * eight JavaScript files against 1194 Swift ones. Firefly III is 1748 PHP files and
 * 221 of JavaScript: eleven per cent, comfortably over the line, and a Laravel
 * application whose package.json runs Vite over its frontend assets. The report said
 * "Package manager: npm (lockfile)" about a project installed with Composer.
 *
 * Where both manifests clear the line the larger language decides, which is the
 * comparison the other manifests already make among themselves.
 */
describe('which manifest builds the product', () => {
  it('prefers the manifest of the language most of the repository is written in', async () => {
    const analysis = await analyzeProject(fixture('laravel-builds-its-assets'));

    expect(analysis.stack.packageManager).toBe('composer');
  });

  /**
   * And the shape this must not break: a repository whose only manifest is a
   * package.json is an npm repository however little JavaScript it holds.
   */
  it('leaves a project with no other manifest alone', async () => {
    const analysis = await analyzeProject(fixture('express-basic'));

    expect(analysis.stack.packageManager).toBe('npm');
  });
});
