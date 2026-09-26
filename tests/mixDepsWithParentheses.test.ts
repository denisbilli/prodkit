import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

/** hexpm writes `defp deps() do`, and none of its packages were read. */
describe('a mix.exs deps function with parentheses', () => {
  it('is read like one without', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-hexpm-'));
    await fs.writeFile(
      path.join(root, 'mix.exs'),
      'defmodule Hexpm.MixProject do\n  use Mix.Project\n\n  def project do\n    [app: :hexpm, deps: deps()]\n  end\n\n  defp deps() do\n    [\n      {:phoenix, "~> 1.6"},\n      {:ecto_sql, "~> 3.0"}\n    ]\n  end\nend\n',
    );
    const analysis = await analyzeProject(root);
    await fs.rm(root, { recursive: true, force: true });

    expect(analysis.stack.backend).toContain('phoenix');
  });
});
