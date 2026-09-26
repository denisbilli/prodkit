import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-miniflux-'));
  for (const [name, content] of Object.entries({ 'go.mod': 'module miniflux.app/v2\n\ngo 1.23\n', ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

const CLI = [
  'package cli',
  '',
  'import "flag"',
  '',
  'func Parse() {',
  '\tflag.StringVar(&flagExportUserFeeds, "export-user-feeds", "", flagExportUserFeedsHelp)',
  '\tflag.BoolVar(&flagResetPassword, "reset-password", false, flagResetPasswordHelp)',
  '\tflag.Parse()',
  '}',
  '',
].join('\n');

const RESET = 'package cli\n\nfunc resetPassword(store *storage.Storage) {\n\tusername, password := askCredentials()\n}\n';

/**
 * miniflux resets a password and exports a user's feeds from its command line, where the
 * operator types them, and was credited with a self-service reset and a personal data
 * export. Its feed fetcher backs off when a feed server answers 429, and that was its
 * rate limiting.
 */
describe('a Go command line', () => {
  it('is the operator, not the product', async () => {
    const analysis = await analyze({
      'internal/cli/cli.go': CLI,
      'internal/cli/reset_password.go': RESET,
    });

    expect(analysis.detectors['auth.passwordReset']?.present).toBe(false);
    expect(analysis.detectors['gdpr.export.route']?.present).toBe(false);
  });

  it('is the product when the same package answers requests', async () => {
    const analysis = await analyze({
      'cli.go': `${CLI}\nfunc resetPasswordPage(w http.ResponseWriter, r *http.Request) {}\n`,
      'reset_password.go': RESET.replace('package cli', 'package main'),
    });

    expect(analysis.detectors['auth.passwordReset']?.present).toBe(true);
  });

  it('is only a package that reads its flags', async () => {
    const analysis = await analyze({
      'internal/account/reset_password.go': RESET.replace('package cli', 'package account'),
    });

    expect(analysis.detectors['auth.passwordReset']?.present).toBe(true);
  });

  it('reads a 429 in a switch arm as a refusal received', async () => {
    const analysis = await analyze({
      'internal/reader/fetcher/response_handler.go': [
        'package fetcher',
        '',
        'func (r *ResponseHandler) Err() error {',
        '\tswitch r.httpResponse.StatusCode {',
        '\tcase http.StatusTooManyRequests:',
        '\t\treturn errRateLimited',
        '\t}',
        '\treturn nil',
        '}',
        '',
      ].join('\n'),
    });

    expect(analysis.detectors['security.core']?.details?.rateLimit).toBe(false);
  });
});
