import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A budget counts answers, not candidates.
 *
 * Several searches here take the first N matches and then filter what came back: the
 * header search drops lines that *read* a header rather than set one, the rate-limit
 * search drops a 429 this project received rather than issued. The cap was spent on
 * the candidates, so a repository with enough noise never handed the filter anything
 * to keep — thirty files reading `content-security-policy` fill a budget of twenty,
 * and the file that sets one is never opened.
 *
 * The read-versus-set rule that made this reachable was added three releases ago, for
 * plausible's CSP checker. The shape it introduced was found by looking for more of
 * what n8n had already shown: a cap that had stopped bounding work and started
 * deciding the answer.
 */
describe('a budget counts answers', () => {
  it('reaches the line that sets a header behind thirty that read one', async () => {
    const report = buildReport(await analyzeProject(fixture('checks-headers-it-also-sets')), { profile: 'auto' });
    const headers = report.findings.find((f) => f.id === 'security.helmet');

    expect(headers?.status).toBe('passed');
    expect(headers?.evidence.some((e) => e.file === 'src/b-server/server.js')).toBe(true);
  });

  /**
   * The other half of the same discovery has no test, and that is worth saying here
   * rather than leaving a green line that proves nothing.
   *
   * The order those budgets are spent in was the filesystem's: fast-glob returns
   * directory entries in whatever order the machine hands them over, so the same
   * repository could be read differently on two computers, or after a fresh clone, in
   * a tool whose own description begins with the word "deterministic". `scanFiles`
   * sorts now.
   *
   * A fixture cannot hold it. Entry order follows how the files came to exist, and a
   * clone creates them in git's order rather than in the order they were written here
   * — so an assertion that the scan comes back sorted passes on this machine with the
   * sort removed, which is the same as not testing it. It was written, it survived its
   * own mutation, and it was deleted instead of kept for the look of the thing.
   */
});
