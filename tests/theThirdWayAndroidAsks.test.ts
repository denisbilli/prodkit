import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The third library that asks at the moment of use.
 *
 * `mobile.permissions` asks whether a permission is explained, not whether it is
 * declared: on iOS by a purpose string, on Android by asking at the moment of use. It
 * knew AndroidX's `ActivityResultContracts.RequestPermission` and Accompanist's
 * `rememberMultiplePermissionsState`, and `gotify/android` uses neither. It asks for
 * `POST_NOTIFICATIONS` through QuickPermissions-Kotlin —
 * `runWithPermissions(Manifest.permission.POST_NOTIFICATIONS, options = ...)`, where the
 * options carry `handleRationale`, `rationaleMethod` and `permanentDeniedMethod` — and
 * was reported as giving no reason for any of the eight permissions it declares.
 *
 * This was measured once before and deliberately left out: one library in one repository
 * is a rule nothing keeps honest. What changed is that `gotify/android` is now in
 * `npm run wild`, so the rule is measured on every release instead of remembered from
 * one afternoon.
 */
describe('the third way Android asks', () => {
  it('accepts a runtime request made through QuickPermissions', async () => {
    const analysis = await analyzeProject(fixture('android-asks-with-quickpermissions'));

    expect(analysis.detectors['mobile.permissions']?.present).toBe(true);
  });

  /**
   * And a manifest full of permissions with nothing asking for them is still the failing
   * case. `android-app` declares them and never requests one.
   */
  it('is not satisfied by a manifest alone', async () => {
    const analysis = await analyzeProject(fixture('android-app'));

    expect(analysis.detectors['mobile.permissions']?.present).toBe(false);
  });
});
