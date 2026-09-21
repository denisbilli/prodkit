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
 * Reading a header is not setting one.
 *
 * plausible ships `tracker/installation_support/check-disallowed-by-csp.js`, whose
 * whole job is to look at somebody else's `content-security-policy` and tell a user
 * why the tracker was blocked on their site. Its line
 * `responseHeaders?.['content-security-policy']` was the evidence behind "security
 * headers: passed" — a tool that inspects other people's headers credited with
 * setting its own.
 *
 * It is the family this analyzer keeps closing: a string is not the thing it names.
 * The shape is the anchor rather than the file — a header name used as a key into a
 * headers object is a lookup, and setting one is a call or an assignment.
 */
describe('a header read is not a header set', () => {
  it('does not credit a tool that inspects somebody else\'s headers', async () => {
    expect((await finding('reads-a-header-it-does-not-set', 'security.helmet'))?.status).toBe('missing');
  });

  /**
   * And the line that does set one still counts, whatever its framework. plausible's
   * own `put_resp_header("content-security-policy", "script-src 'none'")` is four
   * files away from the checker above.
   */
  it('still credits the line that sets one', async () => {
    const found = await finding('phoenix-sets-headers', 'security.helmet');

    expect(found?.status).toBe('passed');
  });
});
