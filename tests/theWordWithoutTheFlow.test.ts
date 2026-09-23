import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The word without the flow.
 *
 * `usememos/memos` declares rate-limit scopes `password_reset_ip` and
 * `password_reset_email` for a reset it has not built, and `dani-garcia/vaultwarden`
 * answers every login with Bitwarden's `"ForcePasswordReset": false`. Both were credited
 * with a self-service password reset on the bare word. What counts now is the path a user
 * is sent to, the forgot and token and recovery patterns, and the frameworks that ship it.
 *
 * A JAX-RS `@Path("reset")` counts only inside `@Path("password")`: resetting a device is
 * not resetting a password.
 */
describe('the word without the flow', () => {
  it('is not a password reset', async () => {
    const analysis = await analyzeProject(fixture('the-word-without-the-flow'));

    expect(analysis.detectors['auth.passwordReset']?.present).toBe(false);
  });
});
