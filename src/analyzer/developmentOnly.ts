/**
 * A file the product does not run in production.
 *
 * Discourse was reported as allowing every cross-origin request, and one of the two
 * lines behind it was `config/environments/development.rb:34`. Rails loads exactly one
 * of those files, chosen by `RAILS_ENV`, so a header set in `development.rb` is as
 * absent from production as a line inside `if settings.DEBUG:` — the same mistake this
 * analyzer had already made in Python and fixed there.
 *
 * Deliberately only the frameworks that name the environment in the path, because
 * that is the only case where the file's own name settles the question. A file called
 * `dev-server.js` might be anything; `config/environments/test.rb` cannot be.
 */
const DEVELOPMENT_ONLY_PATHS = [
  /(^|\/)config\/environments\/(?!production)[a-z_]+\.rb$/i,
  /(^|\/)config\/environments\/(?!production)[a-z_]+\.exs$/i,
];

export function isDevelopmentOnlyFile(file: string): boolean {
  return DEVELOPMENT_ONLY_PATHS.some((pattern) => pattern.test(file));
}

/**
 * The lines of a Rust file that only exist to test it.
 *
 * windmill was reported with a `critical` hardcoded secret:
 * `secret_key: "wrong_secret".to_string()`, in `http_trigger_auth.rs`. It is the
 * fixture of `test_github_authenticate_wrong_secret` — a test asserting that the
 * wrong secret is rejected — and the whole block sits under `#[cfg(test)]`, four
 * hundred lines below the code it tests.
 *
 * The path filter cannot help here and never could: Rust keeps its unit tests inside
 * the file they test, so there is no `tests/` directory to exclude. The language says
 * plainly which lines are test-only, in an attribute written for exactly this purpose,
 * and nothing was reading it.
 *
 * Brace depth rather than a parser: `#[cfg(test)]` is followed by a module, and a
 * module ends where its braces balance. Strings containing braces would confuse it,
 * and the cost of being confused is excluding a few more lines from a security scan
 * of test code — which is where it was heading anyway.
 */
export function testOnlyLines(file: string, text: string): Set<number> {
  const testOnly = new Set<number>();
  if (!/\.rs$/i.test(file)) return testOnly;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*#\[cfg\(test\)\]/.test(lines[i])) continue;

    let depth = 0;
    let opened = false;
    for (let j = i + 1; j < lines.length; j++) {
      testOnly.add(j + 1);
      for (const character of lines[j]) {
        if (character === '{') { depth++; opened = true; }
        else if (character === '}') depth--;
      }
      if (opened && depth <= 0) break;
    }
  }

  return testOnly;
}
