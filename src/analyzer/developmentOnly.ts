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
