import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * koel, a Laravel music server, said three things in Laravel's own words and was
 * credited with none of them.
 */
describe('Laravel says it in its own words', () => {
  /** `throttle:10,1` — the comma stopped the pattern. */
  it('reads a throttle with both of its numbers', async () => {
    expect((await analyzeProject(fixture('laravel-music-server'))).detectors['security.core']?.details?.rateLimit).toBe(true);
  });

  /** `health: '/up'` in `withRouting()` is an endpoint the framework serves. */
  it('reads the health route Laravel 11 registers', async () => {
    expect((await analyzeProject(fixture('laravel-music-server'))).detectors['observability.core']?.details?.healthEndpoint).toBe(true);
  });

  /**
   * A form request whose rules say `'file'` takes an uploaded file, and
   * `File::mimeType(...)` reads its type from the content.
   */
  it('finds an upload behind a form request, and its content check', async () => {
    const uploads = (await analyzeProject(fixture('laravel-music-server'))).detectors['uploads.exposure'];

    expect(uploads?.present).toBe(true);
    expect(uploads?.details?.validation).toBe(true);
  });

  /**
   * BookStack clears its recycle bin of anything older than `recycle_bin_lifetime`
   * days: `subDays($lifetime)`, then `where('created_at', '<', $date)` — the operator
   * as an argument, which is how Laravel's query builder writes a comparison.
   */
  it('reads a trash emptied after a number of days as retention', async () => {
    expect((await analyzeProject(fixture('laravel-recycle-bin-lifetime'))).detectors['gdpr.retention.job']?.present).toBe(true);
  });
});
