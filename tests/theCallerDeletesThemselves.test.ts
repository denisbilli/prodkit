import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The request's own user, deleted.
 *
 * `healthchecks/healthchecks` lets anyone close their account: the view is called
 * `close`, reads `user = request.user`, and calls `user.delete()`. Nothing says erasure,
 * delete account or GDPR, and it was reported as having no erasure flow. Whose account is
 * the question, and the framework answers it — `request.user`, `current_user`,
 * `$request->user()` are the caller.
 */
describe('the caller deletes themselves', () => {
  it('follows request.user to its deletion', async () => {
    const analysis = await analyzeProject(fixture('django-close-account'));

    expect(analysis.detectors['gdpr.erasure.route']?.present).toBe(true);
  });

  it('reads Devise\'s current_user destroyed', async () => {
    const analysis = await analyzeProject(fixture('rails-destroy-current-user'));

    expect(analysis.detectors['gdpr.erasure.route']?.present).toBe(true);
  });

  /** Symfony's caller is `$this->getUser()`, deleted through a service. */
  it('reads Symfony\'s getUser passed to a delete', async () => {
    const analysis = await analyzeProject(fixture('symfony-delete-account'));

    expect(analysis.detectors['gdpr.erasure.route']?.present).toBe(true);
  });

  /**
   * An admin deleting a user by id is every admin screen ever written, and a view that
   * reads the caller and then deletes one of their projects has not deleted the caller.
   */
  it('is not an admin deleting somebody, nor the caller deleting a project', async () => {
    const analysis = await analyzeProject(fixture('deleting-somebody-else'));

    expect(analysis.detectors['gdpr.erasure.route']?.present).toBe(false);
  });
});
