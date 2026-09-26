import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-kutt-'));
  for (const [name, content] of Object.entries({ 'package.json': '{"name":"short","dependencies":{"express":"^4.19.2","bcryptjs":"^2.4.3"}}', ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/**
 * kutt, a URL shortener rendered on the server, lets people reset a password at
 * `/reset-password` and close their account from `views/partials/settings/
 * delete_account.hbs`, and was told at `high` it can do neither.
 */
describe('a server-rendered account page', () => {
  it('reads /reset-password as a reset route', async () => {
    const analysis = await analyze({
      'server/routes/auth.routes.js': 'router.post(\n  "/reset-password",\n  asyncHandler(auth.resetPassword)\n);\n',
    });

    expect(analysis.detectors['auth.passwordReset']?.present).toBe(true);
  });

  it('reads a delete-account template as the way out', async () => {
    const analysis = await analyze({
      'server/routes/user.routes.js': 'router.post("/delete", asyncHandler(user.remove));\n',
      'server/views/partials/settings/delete_account.hbs': '<form hx-post="/api/users/delete"><button>Delete account</button></form>\n',
    });

    expect(analysis.detectors['gdpr.erasure.route']?.present).toBe(true);
  });
});
