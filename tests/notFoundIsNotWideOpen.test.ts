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
 * "Not found" is not "wide open", and a name is not a use.
 *
 * appwrite was reported at `high` as having opened itself to everybody. It has a
 * careful policy: `src/Appwrite/Network/Cors.php` matches origins by hostname, echoes
 * the caller's own back one at a time, never a wildcard, and refuses outright to pair
 * a wildcard with credentials. Two lines produced that finding and neither was about
 * it.
 *
 * The first was `app/config/cors.php`, matched by the path Laravel publishes. appwrite
 * is not a Laravel application; that file holds methods and headers, and the
 * `allowed_origins` key Laravel always writes is not in it. The branch read the
 * missing key as the permissive case — blindness turned into the loudest verdict
 * there is. It says nothing about such a file now.
 *
 * The second was `'name' => 'ALLOWED_ORIGINS',` in appwrite's catalogue of function
 * templates: an environment variable *the user's* function may set, described beside
 * its placeholder and its help text. A string bound to `name`, `key`, `label` or `id`
 * is what a thing is called.
 *
 * appwrite goes from 80 and `partial` with a `high` to 95 and `production_ready`,
 * with the cross-origin question answered `unknown` — which is the truth: nothing
 * here can read that class.
 */
describe('not found is not wide open', () => {
  it('says nothing about a cors.php that Laravel did not publish', async () => {
    expect((await cors('php-cors-config-not-laravel'))?.status).toBe('unknown');
  });

  /**
   * And the Laravel file itself still reads, because that key is what the framework
   * writes. Firefly III's is `['*']` and it must stay `partial`.
   */
  it('still reads the file Laravel did publish', async () => {
    expect((await cors('laravel-open-cors'))?.status).toBe('partial');
  });
});
