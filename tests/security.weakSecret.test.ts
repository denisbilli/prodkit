import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const weakSecret = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)));
  return report.findings.find((f) => f.id === 'security.weak-secret');
};

describe('weak fallback secrets', () => {
  it('does not call a sentence about secrets a hardcoded secret', async () => {
    // The regression, found by running the analyzer against its own repository: the
    // pattern list matched any `|| \'anything\'` and the value filter accepted the bare
    // word "secret", so a line holding a default and the word anywhere in it was
    // reported as critical — the loudest severity there is, and one that caps maturity.
    const finding = await weakSecret('secret-word-in-prose');

    expect(finding?.status).not.toBe('missing');
    expect(finding?.severity).not.toBe('critical');
  });

  it('still reports a real hardcoded fallback secret', async () => {
    // The other half: the fix must narrow the check, not silence it.
    const finding = await weakSecret('express-basic');

    expect(finding?.status).toBe('missing');
    expect(finding?.severity).toBe('critical');
  });

  it('passes a project that requires its secrets instead of defaulting them', async () => {
    const finding = await weakSecret('express-secure');

    expect(finding?.status).toBe('passed');
  });
});
