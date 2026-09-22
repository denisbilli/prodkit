import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A program that hashes a password has somebody to sign in.
 *
 * `auth.core` rested on three things: a package on a list, a route named in English, or
 * a platform identity service. `gotify/server` has none of them. Its Go module requires
 * `golang.org/x/crypto`, which is not an auth package but a hundred different ones, and
 * its routes are `/client`, `/application` and `/message`. It was reported as having
 * nothing to sign in to, and the profile that followed was `client-app`: a notification
 * server with users, tokens and a database, judged as a program somebody installs.
 *
 * What it has is `bcrypt.GenerateFromPassword` and `bcrypt.CompareHashAndPassword`.
 * Those names belong to the library, not to gotify — and the same is true of PHP's
 * `password_hash`, Rails' `has_secure_password`, Spring's `BCryptPasswordEncoder`,
 * ASP.NET's `PasswordHasher<T>` and Django's `check_password`. There is no other reason
 * to call any of them.
 */
describe('the program that hashes a password', () => {
  it('reads authentication off the hashing call, not off the manifest', async () => {
    const analysis = await analyzeProject(fixture('go-server-that-hashes-passwords'));

    expect(analysis.detectors['auth.core']?.present).toBe(true);
  });

  /**
   * And the same for PHP, where it costs a whole profile. `php-app` calls
   * `password_verify` in `src/Auth.php` and used to receive no profile at all — nothing
   * identified it, so it was scored 82 against no expectations whatsoever. With its
   * authentication visible it is a consumer application, and 68.
   */
  it('gives a PHP application with a login the profile it was missing', async () => {
    const analysis = await analyzeProject(fixture('php-app'));

    expect(analysis.detectors['auth.core']?.present).toBe(true);
  });
});
