import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A name given a type is not a decision about anything.
 *
 * pocketbase's report cited three lines for its cross-origin policy: `AllowedOrigins
 * []string`, a field in a Go struct; `var allowedOrigins []string` in the command that
 * parses the flag; and `allowedOrigins: Array<string>` in a generated `.d.ts`. Not one
 * of them decides an origin. The line that does — `config.AllowedOrigins =
 * []string{"*"}`, the default that applies when the flag is absent — was twenty lines
 * further down and was never reached, so a reader was handed three declarations to
 * argue with instead of the policy their server actually runs.
 *
 * The verdict was right either way. What was wrong is the promise underneath it: that
 * every finding points at a line somebody can open and disagree with.
 *
 * It is the same rule as the regex table this file already skips, for the same reason.
 * A declaration says what a thing is; this analyzer claims to say what the code does.
 */
describe('a name given a type is not a decision', () => {
  it('cites the assignment rather than the field it was declared in', async () => {
    const report = buildReport(await analyzeProject(fixture('go-declares-then-decides')), { profile: 'auto' });
    const cors = report.findings.find((f) => f.id === 'security.cors-origin');
    const cited = cors?.evidence.map((e) => e.value) ?? [];

    expect(cited.some((line) => String(line).includes('config.AllowedOrigins = []string{"*"}'))).toBe(true);
    expect(cited.some((line) => String(line).trim() === 'AllowedOrigins []string')).toBe(false);
  });

  /**
   * And the shape that must not be swept up with it. `import SwiftUI` is a keyword
   * followed by a capitalised word and reads exactly like a field given a type — the
   * first version of this rule hid every Swift and Kotlin import, which is how the
   * native toolkits are detected, so an iOS application lost its interface.
   */
  /**
   * Two shapes the first version let through, both found in caddy and gitea.
   *
   * `allowedOrigins []*url.URL` is a struct field whose type is a pointer, and the
   * character class did not allow `*`; `AllowDomain []string // FIXME: this option is
   * from legacy` is the same thing with a note after it, and the rule required the
   * line to end at the type. Both were cited as cross-origin decisions.
   */
  it('skips a declaration with a pointer type or a note after it', async () => {
    const report = buildReport(await analyzeProject(fixture('go-declares-with-a-comment')), { profile: 'auto' });
    const cited = (report.findings.find((f) => f.id === 'security.cors-origin')?.evidence ?? []).map((e) => String(e.value));

    expect(cited.some((line) => line.includes('AllowedOrigins: []string{"*"}'))).toBe(true);
    expect(cited.some((line) => line.startsWith('AllowedOrigins   []string'))).toBe(false);
    expect(cited.some((line) => line.startsWith('allowedOrigins '))).toBe(false);
  });

  /**
   * A function signature is not swept up with them, and that was measured rather than
   * assumed. Thirteen of the corpus's 282 snippet citations are signatures, and they
   * are the *best* evidence in nearly all of them — `function requireAuth(req, res,
   * next)`, `def anonymize_users_data(cutoff)`, `function requirePermission(permission)`.
   * caddy's `func (admin AdminConfig) allowedOrigins(...)` is the unlucky one, and
   * excluding the shape to fix it would have cost twelve good citations.
   */
  it('leaves a function signature alone, which the corpus says is usually the point', async () => {
    const report = buildReport(await analyzeProject(fixture('express-secure')), { profile: 'auto' });
    const cited = (report.findings.find((f) => f.id === 'auth.core')?.evidence ?? []).map((e) => String(e.value));

    expect(cited.some((line) => line.includes('function requireAuth'))).toBe(true);
  });

  it('leaves an import alone, whatever it looks like', async () => {
    const analysis = await analyzeProject(fixture('ios-with-build-tooling'));

    expect(analysis.stack.frontend).toContain('uikit');
  });
});
