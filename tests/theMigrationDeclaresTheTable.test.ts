import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A migration declares a table without writing `CREATE TABLE`.
 *
 * `plausible/analytics` keeps its trail in `audit_entries`: an Ecto migration runs
 * `create table(:audit_entries, ...)`, and every audited change goes through the
 * repository as `update_with_audit!`, `insert_with_audit` or `delete_with_audit!`. The
 * store patterns wanted SQL or one of four nouns — events, logs, auditlog, trail — and
 * the write patterns wanted `record`, `write`, `log`, `create`, `append` or `emit` in
 * front of the word, so a product that records every team and SSO change was reported as
 * having no audit trail at all.
 *
 * The two halves are asserted apart, because each was missed on its own.
 */
describe('the migration declares the table', () => {
  it('finds the store in an Ecto migration', async () => {
    const analysis = await analyzeProject(fixture('ecto-audit-entries'));

    expect(analysis.detectors['audit.trail']?.details?.store).toBe(true);
  });

  it('finds the writes that go through the repository', async () => {
    const analysis = await analyzeProject(fixture('ecto-audit-entries'));
    const audit = analysis.detectors['audit.trail'];

    expect(audit?.details?.writes).toBe(true);
    expect(audit?.complete).toBe(true);
  });
});
