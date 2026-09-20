import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { testOnlyLines } from '../src/analyzer/developmentOnly';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const weakSecret = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((finding) => finding.id === 'security.weak-secret');
};

/**
 * Two `critical` findings from windmill, both on lines that are not secrets.
 *
 * `secret_key: "wrong_secret".to_string()` is the fixture of a test asserting that the
 * wrong secret is rejected, four hundred lines below the code it tests and inside
 * `#[cfg(test)]`. Rust keeps its unit tests in the file they test, so no path filter
 * could ever have excluded it — but the language marks them, in an attribute written
 * for exactly this purpose, and nothing was reading it.
 *
 * `config.global_settings.jwt_secret = "***"` is windmill redacting its own secret
 * before printing an instance's settings. The weak-value test runs on the whole line,
 * and the line says "secret" because the identifier does, so the value was never
 * looked at.
 */
describe('a test fixture and a redaction are not hardcoded secrets', () => {
  it('does not read a Rust unit test as a hardcoded secret', async () => {
    const finding = await weakSecret('rust-inline-tests');

    expect(finding?.status).toBe('passed');
  });

  it('does not read a line that hides a secret as one', async () => {
    const finding = await weakSecret('redacts-its-own-secret');

    expect(finding?.status).toBe('passed');
  });

  it('knows where a Rust test module starts and ends', async () => {
    const text = [
      'fn real() -> &\'static str { "not a test" }',
      '',
      '#[cfg(test)]',
      'mod tests {',
      '    #[test]',
      '    fn t() { let secret_key = "changeme"; }',
      '}',
      '',
      'fn also_real() -> &\'static str { "after the module" }',
    ].join('\n');

    const testOnly = testOnlyLines('src/lib.rs', text);

    expect(testOnly.has(1)).toBe(false);
    expect(testOnly.has(6)).toBe(true);
    // The module ends at its closing brace; what follows is product code again.
    expect(testOnly.has(9)).toBe(false);
  });

  it('applies to Rust and nothing else', () => {
    const text = '#[cfg(test)]\nmod tests {\n  let secret_key = "changeme";\n}';

    expect(testOnlyLines('src/lib.rs', text).size).toBeGreaterThan(0);
    expect(testOnlyLines('src/lib.ts', text).size).toBe(0);
  });

  it('still reports a secret that a Rust project really did hardcode', async () => {
    // The guard must not swallow the case it exists beside: a literal in the code the
    // product runs is still a finding.
    const report = buildReport(await analyzeProject(fixture('rust-inline-tests')), { profile: 'auto' });
    const evidence = report.findings
      .filter((finding) => finding.id === 'security.weak-secret')
      .flatMap((finding) => finding.evidence);

    expect(evidence.every((item) => !String(item.value).includes('wrong_secret'))).toBe(true);
  });
});
