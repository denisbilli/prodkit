import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A picture of a padlock is not a padlock.
 *
 * `immich-app/immich` has no second factor. It was reported as having one on two lines:
 * `mdiTwoFactorAuthentication`, the Material Design icon its settings page puts beside the
 * OAuth section, and a dependency on `qrcode`, which it uses to render shared-album links.
 * An icon is named after what it depicts, and a QR code is how a share link, a payment
 * request or a Wi-Fi password travels as often as an authenticator secret.
 */
describe('a padlock icon is not a padlock', () => {
  it('does not take an icon or a QR code for a second factor', async () => {
    const analysis = await analyzeProject(fixture('a-padlock-icon-is-not-a-padlock'));

    expect(analysis.detectors['auth.2fa']?.present).toBe(false);
  });
});
