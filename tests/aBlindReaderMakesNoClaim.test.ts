import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const finding = async (name: string, id: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === id);
};

/**
 * What a reader who could not read is allowed to say.
 *
 * Teaching the analyzer to read `mix.exs` gave it plausible's backend, its two data
 * stores and its password hashing — all from package names nobody there invented. It
 * also turned every other capability from `unknown` into `missing`: no CORS, no
 * security headers, no health endpoint, no consent, each at `high`, about 1257 Elixir
 * files it had never opened. The guard that used to hold those back was an accident —
 * with no backend detected, the rules said nothing here serves requests — and naming
 * the backend removed it.
 *
 * The same thing had been true of Lua all along, and nobody had looked: four findings
 * asserted absences about a repository in a language this analyzer does not read.
 *
 * Blindness may turn a verdict into no verdict. It may never turn it into the opposite
 * verdict.
 */
describe('a blind reader makes no claim', () => {
  it('withdraws a claim about code it could not read', async () => {
    expect((await finding('lua-project', 'security.helmet'))?.status).toBe('unknown');
  });

  /**
   * And keeps the ones anybody could check. "No Dockerfile" is true of a repository in
   * any language, because the file names are readable whatever is inside the files —
   * so withdrawing it would lose a real answer rather than an overreach.
   */
  it('keeps a claim the file list alone answers', async () => {
    expect((await finding('phoenix-app', 'docker.presence'))?.status).toBe('missing');
  });

  /**
   * A dependency is evidence whatever language the rest of the repository is in:
   * `bcrypt_elixir` in the manifest is a password being hashed.
   */
  it('keeps a verdict that rests on the manifest', async () => {
    expect((await finding('phoenix-app', 'auth.core'))?.status).toBe('partial');
  });
});
