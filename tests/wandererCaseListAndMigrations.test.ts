import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-wanderer-'));
  for (const [name, content] of Object.entries({ 'db/go.mod': 'module pocketbase\n\ngo 1.23\n\nrequire github.com/pocketbase/pocketbase v0.25.0\n', ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/**
 * wanderer retries its media fetches on a 429 listed on a line of its own, and its
 * PocketBase migrations each open with `m.Register(...)`: its rate limiting and its
 * onboarding.
 */
describe('wanderer', () => {
  it('reads a 429 in a case list that runs over lines as received', async () => {
    const analysis = await analyze({
      'db/util/safe_fetch.go': 'package util\n\nfunc retryable(code int) bool {\n\tswitch code {\n\tcase http.StatusRequestTimeout,\n\t\thttp.StatusTooManyRequests,\n\t\thttp.StatusBadGateway:\n\t\treturn true\n\t}\n\treturn false\n}\n',
    });

    expect(analysis.detectors['security.core']?.details?.rateLimit).toBe(false);
  });

  it('reads a migration registering itself as no sign-up', async () => {
    const analysis = await analyze({
      'db/migrations/1742167033_init_meilisearch.go': 'package migrations\n\nfunc init() {\n\tm.Register(func(app core.App) error {\n\t\treturn nil\n\t}, nil)\n}\n',
    });

    expect(analysis.detectors['onboarding.flow']?.present).toBe(false);
  });
});
