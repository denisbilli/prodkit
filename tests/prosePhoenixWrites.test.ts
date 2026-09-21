import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Elixir writes its prose as a module attribute, and the rest is a heredoc.
 *
 * `@moduledoc """ ... """` is the same trap as a Python docstring with a different
 * marker: the interior lines begin with whatever the author was saying, and nothing
 * about them says they are not code. Phoenix generators put one at the top of every
 * controller, context and channel, so a repository has thousands of them, and reading
 * Elixir without this rule turned a sentence that says "we send neither header" into
 * the evidence that headers are sent.
 *
 * Anchored on Elixir's own attribute names rather than on the heredoc, because
 * `@query """SELECT ..."""` is data assigned to a name and a hardcoded secret could
 * live in one. The same distinction the Python reader draws, by a different marker.
 */
describe('the prose Phoenix writes', () => {
  it('does not read a sentence about a header as a header', async () => {
    const report = buildReport(await analyzeProject(fixture('elixir-doc-is-not-code')), { profile: 'auto' });

    expect(report.findings.find((f) => f.id === 'security.helmet')?.status).toBe('missing');
  });
});
