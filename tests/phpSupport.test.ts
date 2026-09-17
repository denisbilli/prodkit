import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('PHP repositories', () => {
  it('reads PHP sources instead of seeing an empty project', async () => {
    // A published application with 57 PHP files was analysed from the single
    // JavaScript file beside them: backend "unknown", a critical for missing
    // authentication that is written in PHP, and "Warnings: none".
    const analysis = await analyzeProject(fixture('php-app'));

    expect(analysis.files.source.some((f) => f.endsWith('.php'))).toBe(true);
  });

  it('names the backend from composer.json', async () => {
    const analysis = await analyzeProject(fixture('php-app'));

    // No framework is required here, so `php` is the honest answer rather than a guess
    // at Laravel.
    expect(analysis.stack.backend).toContain('php');
  });
});

describe('a partial reading says so', () => {
  it('warns about source it could not read', async () => {
    // Being wrong is recoverable. Being wrong while announcing no reservations is not.
    const analysis = await analyzeProject(fixture('lua-project'));

    expect(analysis.stack.warnings.join(' ')).toMatch(/Lua files were not analysed/);
  });
});
