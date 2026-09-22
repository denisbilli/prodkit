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
 * Xcode has generated the Info.plist from build settings since version 13.
 *
 * damus declares five purpose strings and its `Info.plist` holds none of them: they
 * are `INFOPLIST_KEY_NSCameraUsageDescription` and its four siblings in
 * `project.pbxproj`, and again in `de.lproj/InfoPlist.strings` for every language it
 * ships. The report told a careful application, at `high`, that it gives no reason
 * for any permission it asks for.
 *
 * `INFOPLIST_KEY_` is Xcode's prefix and `InfoPlist.strings` is Apple's localisation
 * file; the sentence after the equals sign is the author's, and an empty one is
 * treated as the plist's empty `<string>` already was.
 */
describe('Apple puts the purpose in the build settings', () => {
  it('reads a purpose string declared in project.pbxproj', async () => {
    expect(await finding('ios-purpose-in-build-settings', 'expectation.mobile.permissions.required')).toBeUndefined();
  });

  /**
   * And watching the network is not storing anything.
   *
   * `NWPathMonitor`, `NetInfo` and `navigator.onLine` tell an application whether it
   * is connected. They were in this evidence list while counting for nothing in the
   * verdict, so damus — found to have no store this can read — was shown `let
   * network_monitor = NWPathMonitor()` as the reason it has no local database. A line
   * answering one question, offered as the evidence for another.
   *
   * Where a store is found they belong, because knowing you are offline is part of
   * working offline. Where none is, the search that came up empty is the honest
   * evidence, and a reader whose store this cannot read can see what was looked for.
   */
  it('does not cite a connectivity check as the reason there is no local store', async () => {
    const found = await finding('ios-purpose-in-build-settings', 'expectation.mobile.offline.required');

    expect(found?.status).toBe('missing');
    expect(found?.evidence.some((e) => String(e.value).includes('NWPathMonitor'))).toBe(false);
  });
});
