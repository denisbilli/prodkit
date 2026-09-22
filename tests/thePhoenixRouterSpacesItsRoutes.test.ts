import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Phoenix writes a route with a space, not a bracket.
 *
 * `plausible/analytics` lets somebody close their account at
 * `delete "/me", AuthController, :delete_me` and hand their data over at
 * `get "/:domain/download/export"`. Every erasure pattern wanted `delete(` or `delete:`
 * immediately after the verb, and every export pattern was a compound word —
 * `exportUserData`, `user_export`, `export_account` — where plausible's `export` is the
 * last segment of a path with nothing glued to it.
 *
 * A product whose entire position is privacy was reported as having neither.
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
});
