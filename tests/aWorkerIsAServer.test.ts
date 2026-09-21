import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A Cloudflare Worker is a server with no server framework in it.
 *
 * `wrangler.toml` names the entry module and the compatibility date; the module
 * exports an object with a `fetch` handler. That pair is Cloudflare's documented
 * contract and there is no other way to write a Worker — and together they were read
 * as nothing at all: no backend, no stack, and a report that declined to score a
 * product that serves every request it gets.
 *
 * Weaker than its neighbours, and worth saying where a reader will see it: the shape
 * was diagnosed on a case built from the documentation rather than found in a
 * repository. openstatus, the serverless product measured that day, turned out to have
 * no `wrangler.toml` at all — it deploys to Fly and Vercel. A real Worker should
 * confirm this rule.
 */
describe('a Cloudflare Worker is a server', () => {
  it('is read from the manifest and the fetch handler together', async () => {
    const analysis = await analyzeProject(fixture('cloudflare-worker'));

    expect(analysis.stack.backend).toContain('cloudflare workers');
  });

  it('gets a score, where it used to get none', async () => {
    const report = buildReport(await analyzeProject(fixture('cloudflare-worker')), { profile: 'auto' });

    expect(report.overallScore).not.toBeNull();
  });

  /**
   * Both halves are required. A `wrangler.toml` beside a static site deploys Pages
   * and serves no requests of its own.
   */
  it('is not claimed by a static site that deploys to Pages', async () => {
    const analysis = await analyzeProject(fixture('cloudflare-pages-static'));

    expect(analysis.stack.backend).toEqual([]);
  });

  /**
   * And the other half, which no fixture held until a mutation run asked: an
   * `export default { fetch }` with no manifest is a module somebody imports. A test
   * double that answers requests in memory has exactly that shape.
   */
  it('is not claimed by a fetch handler nothing deploys', async () => {
    const analysis = await analyzeProject(fixture('fetch-handler-no-manifest'));

    expect(analysis.stack.backend).toEqual([]);
  });
});
