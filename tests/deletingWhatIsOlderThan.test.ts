import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Deleting what is older than a number of days is a retention policy.
 *
 * `glitchtip/glitchtip-backend` deletes releases, files and issues older than configured
 * numbers of days from scheduled maintenance jobs, and was told personal data is kept
 * indefinitely: the retention search wanted `gdpr` or `privacy` beside `retention`. An age
 * in days used as a cutoff, and a delete in the same job, is the idiom in every stack.
 */
describe('deleting what is older than', () => {
  it('reads a Django job and a Rails job that purge by age', async () => {
    const analysis = await analyzeProject(fixture('deleting-what-is-older-than'));

    expect(analysis.detectors['gdpr.retention.job']?.present).toBe(true);
    expect(analysis.detectors['gdpr.retention.job']?.evidence.length).toBeGreaterThanOrEqual(2);
  });

  /** glitchtip's API tokens are keys it issues, as a type named `ApiKey` would be. */
  it('reads a token model as keys the product issues', async () => {
    const analysis = await analyzeProject(fixture('deleting-what-is-older-than'));

    expect(analysis.detectors['auth.apiKeys']?.present).toBe(true);
  });

  /**
   * A cookie's lifetime beside a logout's `delete_cookie`, and a dashboard's last seven
   * days beside a draft being discarded, are an age and a delete — and neither is a cutoff
   * something is older than.
   */
  it('is not a lifetime, nor a window of recent rows', async () => {
    const analysis = await analyzeProject(fixture('an-age-that-is-not-a-cutoff'));

    expect(analysis.detectors['gdpr.retention.job']?.present).toBe(false);
  });
});
