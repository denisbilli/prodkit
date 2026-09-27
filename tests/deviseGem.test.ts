import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

/** consul declares `gem "devise"` and was read as having nobody to sign in. */
describe('the devise gem', () => {
  it('is a way to sign in', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-consul-'));
    await fs.writeFile(path.join(root, 'Gemfile'), 'source "https://rubygems.org"\n\ngem "rails", "~> 8.0.5"\ngem "devise", "~> 5.0.4"\n');
    await fs.mkdir(path.join(root, 'app/models'), { recursive: true });
    await fs.writeFile(path.join(root, 'app/models/budget.rb'), 'class Budget < ApplicationRecord\nend\n');
    const analysis = await analyzeProject(root);
    await fs.rm(root, { recursive: true, force: true });

    expect(analysis.detectors['auth.core']?.present).toBe(true);
  });

  it('sends mail through ActionMailer', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-consul-'));
    await fs.writeFile(path.join(root, 'Gemfile'), 'source "https://rubygems.org"\n\ngem "rails", "~> 8.0.5"\n');
    await fs.mkdir(path.join(root, 'app/mailers'), { recursive: true });
    await fs.writeFile(path.join(root, 'app/mailers/mailer.rb'), 'class Mailer < ApplicationMailer\n  def comment(comment)\n    mail(to: comment.author.email)\n  end\nend\n');
    const analysis = await analyzeProject(root);
    await fs.rm(root, { recursive: true, force: true });

    expect(analysis.detectors['notifications.transactional']?.details?.emailDependency).toBe(true);
  });
});
