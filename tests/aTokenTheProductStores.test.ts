import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * An access token the product stores is one it issues.
 *
 * `chatwoot/chatwoot` checks an `api_access_token` header against
 * `class AccessToken < ApplicationRecord` with `has_secure_token :token`, and was credited
 * with API keys on the strength of `AddApiKeySidToTwilioSms` — a migration adding a column
 * for a Twilio key it holds. The verdict was right and the evidence was not.
 */
describe('a token the product stores', () => {
  /**
   * forem reads `request.headers["api-key"]` — no `x-`, which RFC 6648 retired for new
   * headers — and was told it issues no API keys.
   */
  it('reads a key taken from an api-key request header', async () => {
    expect((await analyzeProject(fixture('rails-reads-an-api-key-header'))).detectors['auth.apiKeys']?.present).toBe(true);
  });

  it('reads a persisted AccessToken model as keys it issues', async () => {
    const analysis = await analyzeProject(fixture('rails-issues-access-tokens'));

    expect(analysis.detectors['auth.apiKeys']?.present).toBe(true);
  });

  /**
   * A migration's class is named for the change it makes, and an OAuth client's
   * `AccessToken` is a token somebody else issued, never saved as a model.
   */
  it('is not a migration for a held key, nor a client token class', async () => {
    const analysis = await analyzeProject(fixture('rails-holds-a-twilio-key'));

    expect(analysis.detectors['auth.apiKeys']?.present).toBe(false);
  });
});
