import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The API key scheme that never says "api key".
 *
 * `auth.apiKeys` looked for `x-api-key`, a store of keys, a hashed one, or a token
 * scope — all of them ways a project spells the idea itself. `netbox-community/netbox`
 * issues API tokens as the primary way anything talks to it: a `Token` model in
 * `users/models/tokens.py` and `'netbox.api.authentication.TokenAuthentication'` in
 * DRF's `DEFAULT_AUTHENTICATION_CLASSES`. It was told it offers no API keys.
 *
 * The scheme has a name, and the framework chose it. `TokenAuthentication` is DRF's base
 * class and `authtoken` its app; `HasApiTokens` is Laravel Sanctum's trait;
 * `authenticate_with_http_token` is Rails'. Each says a caller presents a token it was
 * issued, which is the question being asked.
 */
describe('the token named by the framework', () => {
  it('reads an API key scheme off the class the framework named', async () => {
    const analysis = await analyzeProject(fixture('tokens-named-by-the-framework'));

    expect(analysis.detectors['auth.apiKeys']?.present).toBe(true);
  });
});
