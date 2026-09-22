import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A type called ApiKey is a key you issue. A variable called apiKey is one you hold.
 *
 * That distinction is what `auth.apiKeys` exists to draw, and it drew it with a header
 * name, a store of keys, or a hashed one — all of them ways a dynamically typed backend
 * shows its hand. A statically typed one draws it in the type system instead:
 * `dani-garcia/vaultwarden` implements Bitwarden's organization API keys as
 * `OrgApiKeyId` and `OrgApiKeyLoginJwtClaims` in `src/auth.rs`, and was told it offers
 * no API keys at all.
 *
 * Declaring a type for something is modelling it, and nothing models a key it merely
 * holds: a held key is a `String` read out of the environment.
 */
describe('the key you issue and the key you hold', () => {
  it('reads an issued key off the type that models it', async () => {
    const analysis = await analyzeProject(fixture('rust-models-its-api-keys'));

    expect(analysis.detectors['auth.apiKeys']?.present).toBe(true);
  });
});
