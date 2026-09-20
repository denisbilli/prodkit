import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const detector = async (name: string, key: string) => {
  const analysis = await analyzeProject(fixture(name));
  return analysis.detectors[key];
};

/**
 * Six public repositories said the same thing in words this analyzer did not know.
 *
 * supabase/auth — a product whose entire purpose is authentication — was reported as
 * having no password reset. Its code says "Password recovery requires an email" and
 * names the type `Recovery`; the words "reset" and "forgot" appear nowhere. Discourse
 * was reported as offering no way to export or erase personal data while shipping
 * `UserExport` and `UserAnonymizer`.
 *
 * Both are the same defect the product exists to avoid, one level up: the report said
 * a capability was absent when what was absent was the vocabulary to find it.
 */
describe('the same duty, in the words each ecosystem uses', () => {
  it('reads a password recovery as a password reset', async () => {
    const result = await detector('password-recovery-wording', 'auth.passwordReset');

    expect(result?.present).toBe(true);
    expect(result?.evidence.some((e) => /recovery/i.test(String(e.value)))).toBe(true);
  });

  it('reads anonymising a user as erasure', async () => {
    const result = await detector('rails-anonymizer', 'gdpr.erasure.route');

    expect(result?.present).toBe(true);
  });

  it('reads anonymising written in a line, where the file is named something else', async () => {
    // The real one: `scrub_old_weddings.py` holding `def anonymize_users_data(...)`.
    // Nothing in the path says what it does, so only the line can answer.
    const result = await detector('anonymise-in-a-command', 'gdpr.erasure.route');

    expect(result?.present).toBe(true);
    expect(result?.evidence.some((e) => e.type === 'snippet')).toBe(true);
  });

  it('reads a user export as an export of personal data', async () => {
    const result = await detector('rails-anonymizer', 'gdpr.export.route');

    expect(result?.present).toBe(true);
  });

  it('does not read deleting a record as the right to be forgotten', async () => {
    // `deleteUser(id)` is every admin screen ever written. As a line it matched a
    // teaching exercise about `git log -S "deleteUser"` and a function that removes a
    // cloud provider account, neither of which is article 17.
    const result = await detector('admin-deletes-records', 'gdpr.erasure.route');

    expect(result?.present).toBe(false);
  });
});

/**
 * What a file is called, as evidence — weaker than a line, and honest about it.
 *
 * The citation is the file with no line number, because a file name is not a line.
 * Claiming line 1 is the mistake this analyzer spent a release removing.
 */
describe('the name on the file is evidence too', () => {
  it('finds a flow that is named only by its templates', async () => {
    const result = await detector('reset-named-only', 'auth.passwordReset');

    expect(result?.present).toBe(true);
    expect(result?.evidence.every((e) => e.type === 'file')).toBe(true);
  });

  it('points at a file to open, and never at a line it made up', async () => {
    const result = await detector('reset-named-only', 'auth.passwordReset');

    for (const item of result?.evidence ?? []) {
      expect(item.file).toBeTruthy();
      expect(item.line).toBeUndefined();
    }
  });

  it('shows a handful of names rather than every one of them', async () => {
    // A Django project has ten templates named for the password reset and the reader
    // needs to see two.
    const result = await detector('reset-many-templates', 'auth.passwordReset');

    expect(result?.evidence.length).toBeLessThanOrEqual(4);
  });
});
