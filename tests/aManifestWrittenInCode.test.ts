import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Elixir declares its dependencies in code, not in a data file.
 *
 * plausible is 1257 Elixir files and the report had nothing to say about any of it:
 * no backend, no database, no package manager. Phoenix, Ecto, Postgrex, bcrypt_elixir,
 * cors_plug and nimble_totp are all in its `mix.exs`, and every one of those is a
 * package name nobody at plausible invented — the same anchor every other ecosystem
 * here is read through.
 *
 * `mix.exs` is a module with functions in it, so the dependency list is a list literal
 * returned by `deps/0` rather than a section of a file. Reading tuples anywhere in the
 * manifest read plausible's release configuration as two packages called `system` and
 * `no_warn`; `deps: deps()` in `project/0` is Mix's own convention, so the function is
 * where the list is.
 *
 * What this does not do is read the Elixir itself. The report stays inconclusive and
 * says why, which is the honest answer while it is true.
 */
describe('a manifest written in code', () => {
  it('names the framework that serves the requests', async () => {
    const analysis = await analyzeProject(fixture('elixir-analytics'));

    expect(analysis.stack.backend).toContain('phoenix');
  });

  /**
   * Ecto names no store. `postgrex` is what makes it Postgres and `ecto_ch` what makes
   * it ClickHouse, and plausible has both — its application data in one and its
   * analytics in the other.
   */
  it('names both stores, from the drivers rather than from Ecto', async () => {
    const analysis = await analyzeProject(fixture('elixir-analytics'));

    expect(analysis.stack.databases).toEqual(expect.arrayContaining(['postgres', 'clickhouse']));
  });

  /**
   * `only:` is the Elixir spelling of the distinction `runtimeRustDeps` draws: a web
   * server the project only builds with is not what serves its requests.
   */
  it('does not let a dev-only server name the backend', async () => {
    const analysis = await analyzeProject(fixture('elixir-analytics'));

    expect(analysis.stack.backend).not.toContain('bandit');
  });

  /**
   * A tuple beginning with an atom is ordinary Elixir and appears all over a manifest:
   * release configuration, dialyzer settings, an xref exclusion. Read anywhere, they
   * became packages — plausible acquired two called `system` and `no_warn` that way,
   * and a name that happens to be a real package would be worse than a nonsense one.
   */
  it('reads only the deps function, not every tuple in the file', async () => {
    const analysis = await analyzeProject(fixture('elixir-analytics'));
    expect(analysis.stack.databases).not.toContain('mysql');
  });

  it('reads mix as the package manager', async () => {
    const analysis = await analyzeProject(fixture('elixir-analytics'));

    expect(analysis.stack.packageManager).toBe('mix');
  });

  /**
   * And the sign-in it used to miss: `bcrypt_elixir` hashes the password,
   * `nimble_totp` is the second factor.
   */
  it('finds the authentication whose packages have Elixir names', async () => {
    const analysis = await analyzeProject(fixture('elixir-analytics'));

    expect(analysis.detectors['auth.core']?.present).toBe(true);
  });
});
