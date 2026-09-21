import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const weakSecret = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === 'security.weak-secret');
};

/**
 * A secret is a token, and the value was never being looked at.
 *
 * Every test behind "Weak/fallback secret values" ran on the whole line, and the line
 * says "secret" because the identifier does. So any string literal assigned to
 * `secret_key` qualified as a weak fallback, whatever it held. The redaction rule
 * beside it — added for windmill's `jwt_secret = "***"` — was this same discovery made
 * once, for one shape, and patched there.
 *
 * It surfaced the day Elixir became readable, when three products in a row raised it
 * as their only `critical`: the severity that caps maturity. Livebook's was
 * `secret_key: "must be #{@secret_key_size} bytes in Base 64 URL alphabet"`, the
 * validation message shown to somebody who types a bad key.
 *
 * A secret has no spaces in it and is not a template with a variable in the middle.
 * An error message, a label and a sentence are all three.
 */
describe('a secret is a token', () => {
  it('does not read a validation message as a hardcoded secret', async () => {
    const found = await weakSecret('secret-is-a-sentence');

    expect(found?.status).toBe('passed');
  });

  /**
   * And Mix names its environments in the file name. `config/test.exs` is compiled
   * only under `MIX_ENV=test`; a production release carries `config/prod.exs` and
   * `config/runtime.exs` and neither of the other two. supabase/realtime keeps
   * `metrics_jwt_secret: "test"` there and it was the one `critical` in its report.
   */
  it('does not read the test environment config as production', async () => {
    const found = await weakSecret('mix-test-config');

    expect(found?.status).toBe('passed');
  });
});
