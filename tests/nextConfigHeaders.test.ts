import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const finding = async (name: string, id: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === id);
};

/**
 * Next.js' `headers()` is where a Next application sends its headers.
 *
 * formbricks sets X-Frame-Options, a CSP, HSTS and nosniff in `async headers()` in
 * `next.config.mjs` and was told at `high` to add security headers: the lines are
 * `key: "X-Frame-Options",`, and a string bound to `key` is set aside everywhere else
 * as a name. In that function the key is the header sent, because Next says so.
 */
describe('next.config headers()', () => {
  it('credits headers set in next.config headers()', async () => {
    const found = await finding('next-config-sets-headers', 'security.helmet');

    expect(found?.status).toBe('passed');
    expect(found?.evidence.some((e) => e.file === 'next.config.mjs')).toBe(true);
  });

  /**
   * The same `key:` lines in a table somewhere else are still names, and a
   * next.config without `headers()` sends nothing.
   */
  it('does not credit a catalogue of header names', async () => {
    expect((await finding('next-config-without-headers', 'security.helmet'))?.status).toBe('missing');
  });
});
