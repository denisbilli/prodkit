import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const permissions = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === 'expectation.mobile.permissions.required');
};

/**
 * Android asks at the moment of use, in whichever of Google's two libraries.
 *
 * Apple requires a purpose string and reads it in review; Android has none, so the
 * equivalent evidence is asking when the feature needs it rather than on startup.
 * The detector knew `ActivityCompat.requestPermissions` and its relatives, all of
 * which predate Compose.
 *
 * davx5 shows a switch per permission and calls
 * `state::launchMultiplePermissionRequest` when somebody turns one on — Accompanist's
 * API, which is asking at the moment of use as plainly as it can be asked — and was
 * told at `high` that it gives no reason for any of the twelve permissions it
 * declares. `ActivityResultContracts.RequestPermission` is the AndroidX contract that
 * replaced the old call. Both names belong to Google; what the launcher is called
 * afterwards belongs to the author, which is why the pattern stops at the contract.
 */
describe('Android asks at the moment of use', () => {
  it('reads a permission requested through Accompanist as a reason given', async () => {
    expect(await permissions('android-asks-with-accompanist')).toBeUndefined();
  });

  /**
   * And Gradle names the source set a file belongs to. `src/androidTest/` is
   * instrumentation tests and is not shipped; davx5's permission finding opened with
   * the manifest from there, declaring three permissions its tests need — a test's
   * manifest offered as the application's permission surface.
   */
  it('does not count the manifest of a test source set', async () => {
    const found = await permissions('android-test-source-set');

    expect(found?.evidence.some((e) => String(e.value).includes('androidTest'))).toBe(false);
    expect(found?.evidence.some((e) => String(e.value).includes('src/main/AndroidManifest.xml'))).toBe(true);
  });
});
