import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { matchLines } from '../src/utils/textSearch';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A placeholder is not a value.
 *
 * pocketbase was reported as having tenant boundaries — `passed`, which raises a
 * score — and the only two strong matches in its readable source were
 * `"Ex. https://login.microsoftonline.com/YOUR_DIRECTORY_TENANT_ID/oauth2/v2.0/authorize"`,
 * twice, in the help text of the form where somebody configures Microsoft sign-in.
 * Microsoft Entra calls its directory a tenant; the string tells a reader where to
 * paste theirs. pocketbase has no organizations at all, and the rest of that finding
 * was Apple's developer `teamId`, a weak word that cannot stand alone.
 *
 * `YOUR_SOMETHING` is the convention for "replace this" — in documentation, in example
 * configuration, in the hint beside a field. This analyzer already knew the shape:
 * `your[_-]?secret` has been in the weak-secret list since the beginning.
 */
describe('a placeholder is not a value', () => {
  it('does not read a tenant id somebody has to fill in as a tenant model', async () => {
    const report = buildReport(await analyzeProject(fixture('placeholder-in-help-text')), { profile: 'auto' });

    expect(report.findings.find((f) => f.id === 'tenancy.b2b')?.status).not.toBe('passed');
  });

  /**
   * The token around the match decides, not the line: a line may hold a placeholder
   * and a real value both, and only the matched one is being judged.
   */
  it('judges the token, not the line it sits on', () => {
    const line = 'const config = { hint: "YOUR_TENANT_ID", tenantId: row.tenantId }';

    expect(matchLines(line, [/tenantId/], 'a.js')).toHaveLength(1);
    expect(matchLines('const hint = "YOUR_TENANT_ID"', [/tenant_id/i], 'a.js')).toHaveLength(0);
  });
});
