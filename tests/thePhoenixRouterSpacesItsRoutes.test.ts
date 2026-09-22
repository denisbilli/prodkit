import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Phoenix writes a route with a space, not a bracket.
 *
 * `plausible/analytics` lets somebody close their account at
 * `delete "/me", AuthController, :delete_me`. Every erasure pattern wanted `delete(` or
 * `delete:` immediately after the verb, and every export pattern was a compound word —
 * `exportUserData`, `user_export`, `export_account` — where a route's `export` is the
 * last segment of a path with nothing glued to it.
 *
 * plausible's own export, `get "/:domain/download/export"`, was the example here until
 * the wild check showed what a bare terminal `export` also admits: a site's statistics
 * are not the person's data. The route below says whose it is.
 *
 * The trailing comma keeps the erasure pattern to a router: `delete "/me"` on its own
 * could be prose, and a Phoenix route is always followed by the controller that handles
 * it. The export pattern is quoted and terminal for the same reason `/status` is —
 * `export` is a common verb and a common column, and the one thing it cannot be at the
 * end of a quoted path is anything but an endpoint that hands data over.
 */
describe('the Phoenix router spaces its routes', () => {
  it('finds erasure and export in a router that uses no brackets', async () => {
    const analysis = await analyzeProject(fixture('phoenix-router-spaces-its-routes'));

    expect(analysis.detectors['gdpr.erasure.route']?.present).toBe(true);
    expect(analysis.detectors['gdpr.export.route']?.present).toBe(true);
  });

  /**
   * An export is not the person's data because it ends in `/export`. open-webui's
   * `/configs/export`, vaultwarden's organisation export, plausible's site statistics and
   * an admin's CSV of every user each hand data over, and none of it is the caller's own
   * — which is what article 20 asks for and what `gdpr.export` says it checks.
   */
  it('does not take any export for the person\'s own', async () => {
    const analysis = await analyzeProject(fixture('an-export-that-is-not-yours'));

    expect(analysis.detectors['gdpr.export.route']?.present).toBe(false);
  });
});
