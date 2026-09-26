import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function erasureIn(controller: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-loomio-'));
  const files: Record<string, string> = {
    Gemfile: "source 'https://rubygems.org'\ngem 'rails', '~> 7.1'\ngem 'devise'\n",
    'app/controllers/api/v1/profile_controller.rb': controller,
  };
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['gdpr.erasure.route']?.present;
}

const controller = (action: string, body: string) =>
  `class Api::V1::ProfileController < Api::V1::RestfulController\n  def ${action}\n    ${body}\n    respond_with_resource\n  end\nend\n`;

/**
 * loomio closes an account in `ProfileController#destroy` by handing `current_user` to a
 * service that redacts it, and was told at `high` it has no erasure flow.
 */
describe("Rails' destroy action handed the caller", () => {
  it('is the caller closing their account', async () => {
    expect(await erasureIn(controller('destroy', 'service.redact(user: current_user, actor: current_user)'))).toBe(true);
  });

  it('is not a sign-out', async () => {
    expect(await erasureIn(controller('destroy', 'sign_out(current_user)'))).toBe(false);
  });

  it('is not the loaded resource destroyed by the caller', async () => {
    expect(await erasureIn(controller('destroy', '@poll_template.discard!(actor: current_user)'))).toBe(false);
  });

  it('is not the caller named after something else', async () => {
    expect(await erasureIn(controller('destroy', 'CommentService.destroy(comment: load_resource, actor: current_user)'))).toBe(false);
  });

  it('is only the destroy action', async () => {
    expect(await erasureIn(controller('update', 'service.update(user: current_user, params: params)'))).toBe(false);
  });
});
