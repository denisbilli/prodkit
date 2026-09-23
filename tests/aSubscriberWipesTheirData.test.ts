import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Wiping somebody's data is the other half of exporting it.
 *
 * `knadh/listmonk` lets a subscriber export and wipe their data from the same page —
 * `exportSubscriberData` and `WipeSubscriberData` — and was credited with the export
 * alone.
 */
describe('a subscriber wipes their data', () => {
  it('reads wipe as erasure', async () => {
    const analysis = await analyzeProject(fixture('a-subscriber-wipes-their-data'));

    expect(analysis.detectors['gdpr.erasure.route']?.present).toBe(true);
  });

  /** `delete` stays out: an admin deleting a user's data is an admin screen. */
  it('is not an admin deleting user data', async () => {
    const analysis = await analyzeProject(fixture('an-admin-deletes-user-data'));

    expect(analysis.detectors['gdpr.erasure.route']?.present).toBe(false);
  });
});
