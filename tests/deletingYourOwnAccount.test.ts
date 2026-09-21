import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const gdpr = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === 'gdpr.privacy');
};

/**
 * A DELETE on the caller's own account is what article 17 asks for.
 *
 * `deleteUser(id)` was measured and withdrawn a long time ago, because delete is every
 * admin screen ever written, and the note recording that is still in the detector. A
 * route is not that call. atuin's server declares `.route("/account",
 * delete(handlers::user::delete))` and was told it has no erasure flow at all.
 *
 * The difference between the two is in the path, which says whose account is being
 * removed. `DELETE` is HTTP's word; `/account`, `/users/me` and `/me` are the
 * conventional first-person ones.
 */
describe('deleting your own account', () => {
  it('reads a DELETE on /account as the erasure flow', async () => {
    const found = await gdpr('deletes-your-own-account');

    expect(found?.status).toBe('passed');
    expect(found?.evidence.some((e) => String(e.value).includes('.route("/account"'))).toBe(true);
  });

  /**
   * And keeps the admin screen out, which is the whole reason the bare call was
   * withdrawn. `/accounts/:id` removes somebody else's: the word boundary after
   * `account` fails on the plural.
   */
  it('does not read an admin removing somebody else as erasure', async () => {
    expect((await gdpr('admin-deletes-an-account'))?.status).toBe('missing');
  });
});
