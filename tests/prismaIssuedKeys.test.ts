import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * An API key the product issues, declared in Prisma.
 *
 * linkwarden issues tokens from `/api/v1/tokens`, each a `model AccessToken` row that
 * belongs to a user, and was told it offers no API keys: the schema is a `.prisma`
 * file and the persisted-model anchors spoke only ActiveRecord and Django.
 */
describe('a Prisma model of issued keys', () => {
  it('counts an access token model that belongs to a user', async () => {
    const found = (await analyzeProject(fixture('prisma-issues-access-tokens'))).detectors['auth.apiKeys'];

    expect(found?.present).toBe(true);
    expect(found?.evidence.some((e) => e.file === 'prisma/schema.prisma')).toBe(true);
  });

  /** A table of keys nobody owns is keys the product holds for somebody else's service. */
  it('does not count a key store with no owner', async () => {
    expect((await analyzeProject(fixture('prisma-holds-api-keys'))).detectors['auth.apiKeys']?.present).toBe(false);
  });
});
