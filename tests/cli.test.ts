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
});