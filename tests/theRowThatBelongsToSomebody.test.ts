import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Rails checks ownership by comparing the row's foreign key to the signed-in user.
 *
 * `authz.resourceLevel` knew Express shapes (`req.user.id`, `ownerId`, `userId ===`) and
 * Django ones (`request.user.pk !=`, `UserPassesTestMixin`, a `get_queryset` filtered by
 * user), and no Ruby ones at all. `lobsters/lobsters` writes
 * `if @message.recipient_user_id == @user.id` and `@message.author_user_id == @user.id`
 * in its messages controller, and was told it has no per-record authorization.
 *
 * `<something>_user_id` is Rails' foreign-key convention, not a name anybody picked, and
 * comparing one is what an ownership check is: there is no other reason to test a row's
 * user column against a value. Pundit's `authorize @record` and `policy_scope`, and
 * CanCanCan's `load_and_authorize_resource` and `can?`, are stronger still — both gems
 * exist for this one question, and Pundit's `authorize` takes no parentheses, which is
 * why the existing `authorize(` pattern could not see it.
 */
describe('the row that belongs to somebody', () => {
  it('reads ownership off the foreign key comparison', async () => {
    const analysis = await analyzeProject(fixture('rails-checks-the-foreign-key'));

    expect(analysis.detectors['authz.resourceLevel']?.present).toBe(true);
  });

  /**
   * And where the convention capitalises. `gotify/server` guards every message and
   * client route with `app.UserID == auth.GetUserID(ctx)` and was told the same thing:
   * Go, C# and Java write `UserID` or `UserId`, which the snake_case pattern does not
   * match, and JavaScript's `userId ===` needs three equals signs.
   */
  it('reads it where the convention capitalises', async () => {
    const analysis = await analyzeProject(fixture('go-server-that-hashes-passwords'));

    expect(analysis.detectors['authz.resourceLevel']?.present).toBe(true);
  });
});
