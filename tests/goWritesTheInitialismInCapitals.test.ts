import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Go writes an initialism in capitals.
 *
 * `getfider/fider` issues a key per user, looks it up with `type GetUserByAPIKey struct`
 * and rotates it with `RegenerateAPIKey`, and was told it offers no API keys: the type rule
 * wanted `ApiKey`, and Go's own style guide says `APIKey`.
 */
describe('Go writes the initialism in capitals', () => {
  it('reads a type named for the keys it issues', async () => {
    const analysis = await analyzeProject(fixture('go-issues-api-keys'));

    expect(analysis.detectors['auth.apiKeys']?.present).toBe(true);
  });

  /** A struct field holding the product's own key for somebody else's service is not it. */
  it('is not a key the program holds', async () => {
    const analysis = await analyzeProject(fixture('go-holds-an-api-key'));

    expect(analysis.detectors['auth.apiKeys']?.present).toBe(false);
  });
});
