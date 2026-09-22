import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { matchLines } from '../src/utils/textSearch';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A header name on a line of its own says which header, not what value.
 *
 * saleor's ASGI handler writes its response headers as a list of tuples, so
 * `b"access-control-allow-origin",` sits alone on line 50 and the origin it will
 * carry is on line 51. Saleor appends that pair only when the caller's origin matched
 * its allowlist, and answers 400 when it did not — a strict policy, reported at
 * `high` as one with no restrictions, on the strength of a line that cannot show a
 * policy because there is no value on it.
 *
 * It reads `unknown` now: nothing here can follow that handler, and saying so is the
 * honest half of being wrong about it. saleor goes from 73 to 83.
 */
describe('a header name on a line of its own', () => {
  it('does not read a header name in a tuple as a permissive policy', async () => {
    const report = buildReport(await analyzeProject(fixture('asgi-header-name-alone')), { profile: 'auto' });

    expect(report.findings.find((f) => f.id === 'security.cors-origin')?.status).toBe('unknown');
  });

  /**
   * The bare-string-in-a-list rule stays intact, and this is the case that fixed it:
   * `'django.contrib.auth',` in an INSTALLED_APPS array *is* the behaviour. Skipping
   * standalone strings once cost a real Django project eight points for being
   * legible, and a header name is different because it names a slot that is filled
   * somewhere else.
   */
  it('still reads a bare string in a list that is the behaviour', () => {
    expect(matchLines('    "django.contrib.auth",', [/django\.contrib\.auth/], 'settings.py')).toHaveLength(1);
  });
});
