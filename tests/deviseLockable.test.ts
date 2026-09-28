import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function rateLimit(model: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-chaskiq-'));
  await fs.writeFile(path.join(root, 'Gemfile'), 'source "https://rubygems.org"\n\ngem "rails", "~> 7.1"\ngem "devise"\n');
  await fs.mkdir(path.join(root, 'app/models'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/models/agent.rb'), model);
  const found = (await analyzeProject(root)).detectors['security.core']?.details?.rateLimit;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** chaskiq's agents are locked after failed sign-ins, and it read as limiting nothing. */
describe("Devise's lockable module", () => {
  it('is a rate limit on its own line', async () => {
    expect(await rateLimit('class Agent < ApplicationRecord\n  devise :database_authenticatable,\n         :recoverable,\n         :lockable,\n         :validatable\nend\n')).toBe(true);
  });

  it('is a rate limit on the devise line', async () => {
    expect(await rateLimit('class Agent < ApplicationRecord\n  devise :database_authenticatable, :lockable\nend\n')).toBe(true);
  });

  it('is not the symbol in an expression', async () => {
    expect(await rateLimit('class Agent < ApplicationRecord\n  devise :database_authenticatable\n  def locked? = respond_to?(:lockable) && access_locked?\nend\n')).toBe(false);
  });

  it("is not the generator's comment", async () => {
    expect(await rateLimit('class Agent < ApplicationRecord\n  # :confirmable, :lockable, :timeoutable and :omniauthable\n  devise :database_authenticatable, :recoverable\nend\n')).toBe(false);
  });
});
