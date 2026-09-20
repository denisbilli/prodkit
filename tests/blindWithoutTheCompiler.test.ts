import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pretendTypeScriptIsMissing, resetTypeScriptCache } from '../src/analyzer/structural/loadTypeScript';

/**
 * What this analyzer says when it cannot read structure.
 *
 * The TypeScript compiler is an optional peer dependency, so the ordinary case — `npx
 * prodkit` against somebody else's repository — has no parser at all. Every structural
 * reader returns null there, and the detectors that rest on one were reporting the
 * silence as an answer: measured by hiding `node_modules/typescript` and re-running the
 * fixture corpus, seven of a hundred and thirty-three repositories changed verdict, and
 * `segreto-in-italiano` called a hardcoded signing secret `passed`.
 *
 * The rule these tests hold: blindness may turn a verdict into no verdict, never into
 * the opposite verdict, and never into a clean bill of health.
 */
const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

async function analyzeBlind(name: string) {
  const { analyzeProject } = await import('../src/analyzer/analyzeProject');
  const { buildReport } = await import('../src/report/buildReport');

  return buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
}

const statusOf = (report: { findings: Array<{ id: string; status: string }> }, id: string) =>
  report.findings.find((finding) => finding.id === id)?.status;

describe('what it says when the optional compiler is absent', () => {
  beforeEach(() => pretendTypeScriptIsMissing());
  afterEach(() => resetTypeScriptCache());

  it('does not pass a hardcoded signing secret it could not go looking for', async () => {
    const report = await analyzeBlind('segreto-in-italiano');

    expect(report.diagnostics.parsedStructure).toBe(false);
    expect(statusOf(report, 'security.weak-secret')).toBe('unknown');
  });

  /**
   * `unanswered` has to mean "the answer depends on the reader that did not run", not
   * "a reader did not run". Without this the flag marked 79 of the 133 fixtures as not
   * assessed for weak secrets — including every repository where the secret is found
   * by its own name and the sink-following reader would have added nothing.
   */
  it('still answers where no file reaches a signing call at all', async () => {
    const report = await analyzeBlind('astro-static');

    expect(report.diagnostics.parsedStructure).toBe(false);
    expect(statusOf(report, 'security.weak-secret')).toBe('passed');
  });

  it('does not turn an ownership check it cannot see into a missing one', async () => {
    const report = await analyzeBlind('proprieta-in-italiano');

    expect(statusOf(report, 'authz.resource-level')).toBe('unknown');
  });

  it('does not deny a login limiter whose coverage it cannot read', async () => {
    const report = await analyzeBlind('express-limits-the-login');

    expect(statusOf(report, 'security.rate-limit-auth')).toBe('unknown');
  });

  it('tells the reader the compiler is why, and how to change it', async () => {
    const { renderMarkdown } = await import('../src/report/markdownReport');
    const markdown = renderMarkdown(await analyzeBlind('segreto-in-italiano'));

    expect(markdown).toMatch(/typescript` peer dependency is not installed/);
  });
});
