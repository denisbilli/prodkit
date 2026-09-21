import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const envExample = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === 'env.example');
};

/**
 * The template has more than one spelling, and one exact string knew one of them.
 *
 * immich ships `docker/example.env` — the name reversed, and one directory down, which
 * is where a compose deployment keeps it — and was told at `medium` that it reads
 * environment variables without publishing a template. The check was
 * `files.all.includes('.env.example')`: the right idea matched against a single
 * literal at the root, so `.env.sample`, `.env.template`, `.env.dist` and every
 * monorepo's `apps/api/.env.example` were invisible too.
 *
 * immich goes from 83 to 88, cited at the file it actually ships.
 */
describe('the template has more than one name', () => {
  it('finds a template whose name is reversed and nested', async () => {
    const found = await envExample('env-template-under-another-name');

    expect(found?.status).toBe('passed');
    expect(found?.evidence.some((e) => e.value === 'docker/example.env')).toBe(true);
  });

  /**
   * And the shape that must not change: `.env` itself is not a template. It is the
   * real file, and a committed one is a different finding entirely.
   */
  it('does not accept the real file as its own template', async () => {
    const found = await envExample('env-without-a-template');

    expect(found?.status).not.toBe('passed');
  });
});
