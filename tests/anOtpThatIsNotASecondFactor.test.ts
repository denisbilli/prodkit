import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * An OTP that is not a second factor.
 *
 * `otp` as a bare word read Erlang's Open Telecom Platform in every Phoenix endpoint
 * (`otp_app: :app`) and a desktop agent's pairing code (`generate_otp`, `get_otp`) in
 * hoppscotch as a second factor. What a second factor has is a secret and a check —
 * `otp_secret`, `verifyOtp`, `totp` — or a TOTP library, which is what listmonk
 * (`github.com/pquerna/otp`) and traccar (`com.warrenstrange:googleauth`) are found by.
 */
describe('an OTP that is not a second factor', () => {
  it('is not OTP the platform, nor a pairing code', async () => {
    const analysis = await analyzeProject(fixture('an-otp-that-is-not-a-second-factor'));

    expect(analysis.detectors['auth.2fa']?.present).toBe(false);
  });
});
