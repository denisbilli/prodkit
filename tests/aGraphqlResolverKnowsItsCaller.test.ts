import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A GraphQL resolver knows its caller, and an allowlist can have a qualifier.
 *
 * `saleor/saleor` was reported at `high` with no erasure flow and no cross-origin policy.
 * Its `AccountDelete` mutation reads `user = info.context.user` — graphene's and
 * strawberry's name for Django's `request.user` — and calls `user.delete()`. And it
 * matches every origin against `settings.ALLOWED_GRAPHQL_ORIGINS`, read from the
 * environment with `"*"` as its default: a policy, and an open one until configured.
 */
describe('a GraphQL resolver knows its caller', () => {
  it('reads info.context.user deleting itself as erasure', async () => {
    const analysis = await analyzeProject(fixture('graphql-account-delete'));
    const erasure = analysis.detectors['gdpr.erasure.route'];

    expect(erasure?.present).toBe(true);
    // The staff mutation deletes a customer by id; only the caller's own deletion is cited.
    expect(erasure?.evidence.every((e) => !/Customer\.objects/.test(e.value))).toBe(true);
  });

  it('reads ALLOWED_GRAPHQL_ORIGINS as a cross-origin allowlist, open by default', async () => {
    const analysis = await analyzeProject(fixture('graphql-account-delete'));

    expect(analysis.detectors['security.core']?.details?.corsLoose).toBe(true);
  });
});
