import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const cors = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === 'security.cors-origin');
};

/**
 * A constant that spells its own name is not a policy.
 *
 * photoprism keeps `AccessControlAllowOrigin = "Access-Control-Allow-Origin"` in
 * `pkg/http/header/cors.go`, beside three more of the same, and that table was the
 * whole evidence for its cross-origin finding — while
 * `c.Header(header.AccessControlAllowOrigin, header.Any)` in `start.go` and
 * `static.go`, the lines that actually open it, went uncited. The verdict was right
 * and every line under it was a name for something rather than a use of it.
 *
 * It is the third member of a family: a regex in a table is not a search, a name
 * given a type is not a decision, and a header constant is not a header.
 */
describe('a constant that spells its own name', () => {
  it('cites the line that sets the header, not the one that names it', async () => {
    const found = await cors('go-names-its-headers');

    expect(found?.status).toBe('partial');
    expect(found?.evidence.some((e) => String(e.value).includes('c.Header('))).toBe(true);
    expect(found?.evidence.some((e) => String(e.value).startsWith('AccessControlAllowOrigin  ='))).toBe(false);
  });

  /**
   * And the half that had to land with it. Those uses write the constant, not the
   * string, so a pattern spelled as the wire name saw none of them — excluding the
   * table on its own took photoprism from a right verdict on the wrong evidence to no
   * verdict at all, which is worse. Go, Java and C# write `AccessControlAllowOrigin`
   * because that is what their conventions do to `Access-Control-Allow-Origin`; it is
   * the protocol's name either way.
   */
  it('reads the header spelled the way the language spells it', async () => {
    const found = await cors('go-names-its-headers');

    expect(found?.status).not.toBe('unknown');
  });
});
