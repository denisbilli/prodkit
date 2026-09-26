import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function erasureFrom(file: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-ofn-'));
  const files: Record<string, string> = {
    Gemfile: "source 'https://rubygems.org'\ngem 'rails', '~> 7.1'\n",
    [file]: 'class Change < ActiveRecord::Migration[7.1]\n  def up\n    drop_table :account_invoices\n  end\nend\n',
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

/**
 * openfoodnetwork was credited with account deletion on the strength of
 * `db/migrate/…_delete_account_invoices_preferences.rb`, a migration dropping a table.
 */
describe('a migration named for deleting', () => {
  it('is not erasure in Rails\' db/migrate', async () => {
    expect(await erasureFrom('db/migrate/20190221131622_delete_account_invoices_preferences.rb')).toBe(false);
  });

  it('is not erasure in a migrations directory', async () => {
    expect(await erasureFrom('app/migrations/0042_delete_account_flags.rb')).toBe(false);
  });

  it('is erasure when the file is a feature', async () => {
    expect(await erasureFrom('app/services/delete_account.rb')).toBe(true);
  });
});
