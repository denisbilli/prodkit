import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('cli', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints an analysis summary without throwing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runCli(['node', 'prodkit', 'analyze', fixture('express-basic'), '--summary']);

    expect(logSpy).toHaveBeenCalled();
    expect(logSpy.mock.calls.flat().join('\n')).toContain('ProdKit Analysis Summary');
  });

  it('rejects a project path that does not exist', async () => {
    await expect(
      runCli(['node', 'prodkit', 'analyze', fixture('does-not-exist')])
    ).rejects.toThrow(/Project path does not exist/);
  });

  it('rejects a project path that is not a directory', async () => {
    await expect(
      runCli(['node', 'prodkit', 'analyze', path.resolve(__dirname, 'fixtures', 'express-basic', 'package.json')])
    ).rejects.toThrow(/not a directory/);
  });

  it('rejects an unknown profile', async () => {
    await expect(
      runCli(['node', 'prodkit', 'analyze', fixture('express-basic'), '--profile', 'not-a-profile'])
    ).rejects.toThrow(/Invalid profile "not-a-profile"/);
  });

  it('fails the score gate when the score is below --fail-under', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(
      runCli(['node', 'prodkit', 'analyze', fixture('express-basic'), '--fail-under', '90'])
    ).rejects.toThrow(/Score gate failed/);
  });

  it('passes the score gate when the score meets --fail-under', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(
      runCli(['node', 'prodkit', 'analyze', fixture('express-secure'), '--fail-under', '50'])
    ).resolves.toBeUndefined();
  });

  it('fails the maturity gate when maturity is below --min-maturity', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(
      runCli(['node', 'prodkit', 'analyze', fixture('express-basic'), '--min-maturity', 'partial'])
    ).rejects.toThrow(/Maturity gate failed/);
  });

  it('rejects invalid gate values', async () => {
    await expect(
      runCli(['node', 'prodkit', 'analyze', fixture('express-basic'), '--fail-under', '150'])
    ).rejects.toThrow(/Invalid --fail-under value/);

    await expect(
      runCli(['node', 'prodkit', 'analyze', fixture('express-basic'), '--min-maturity', 'legendary'])
    ).rejects.toThrow(/Invalid --min-maturity value/);
  });

  it('reports an unrecognizable project as inconclusive in the summary', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runCli(['node', 'prodkit', 'analyze', fixture('unknown-project'), '--summary']);

    expect(logSpy.mock.calls.flat().join('\n')).toContain('INCONCLUSIVE');
  });
});