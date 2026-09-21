import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const cors = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === 'security.cors-origin');
};

/**
 * Elixir configures CORS as a plug, and the origin is the decision.
 *
 * `cors_plug` and `corsica` are the two packages, and the module name comes from the
 * package rather than from the author: `plug CORSPlug, origin: [...]`. What the author
 * chose is the value, which is the same reflection-versus-allowlist question the other
 * six frameworks here are asked.
 *
 * Where the plug names no origin, cors_plug's own default is `"*"`, so silence belongs
 * in the open branch rather than the strict one — plausible's endpoint says exactly
 * `plug(CORSPlug)` and serves every origin.
 */
describe('CORS in Elixir is a plug', () => {
  it('reads a plug with no origin as wide open, because that is its default', async () => {
    expect((await cors('phoenix-cors-open'))?.status).toBe('partial');
  });

  it('reads a chosen origin as a decision somebody made', async () => {
    expect((await cors('phoenix-cors-chosen'))?.status).toBe('passed');
  });
});
