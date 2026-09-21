import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const statusOf = (report: { findings: Array<{ id: string; status: string }>; passedChecks: Array<{ id: string; status: string }> }, id: string) =>
  [...report.findings, ...report.passedChecks].find((f) => f.id === id)?.status;

/**
 * PHP, measured on two real products: Firefly III (Laravel) and Sylius (Symfony).
 *
 * Laravel puts both answers in files whose names the framework chose, and nothing
 * here opened either. `config/cors.php` is published by Laravel and read by its own
 * middleware; Firefly III has one whose `allowed_origins` is `['*']`, and the report
 * said it had no cross-origin configuration at all — the worst direction for this
 * check, because a project that opened itself to the whole web read as one that had
 * not thought about it.
 */
describe('cross-origin handling in Laravel', () => {
  it('reads the configuration file the framework publishes', async () => {
    const report = buildReport(await analyzeProject(fixture('laravel-chosen-origins')), { profile: 'auto' });

    expect(statusOf(report, 'security.cors-origin')).toBe('passed');
  });

  it('calls a wildcard allowlist what it is', async () => {
    const report = buildReport(await analyzeProject(fixture('laravel-open-cors')), { profile: 'auto' });

    expect(statusOf(report, 'security.cors-origin')).toBe('partial');
  });
});

/**
 * PHP has one driver — PDO, in the runtime — so `composer.json` says nothing about
 * which engine a project talks to, and nothing here read the file that does. Firefly
 * III reported no data layer, above a `config/database.php` whose first line of
 * substance is `'default' => env('DB_CONNECTION', 'mysql')`.
 */
describe('the database a Laravel project falls back to', () => {
  it('is read from the configuration rather than from a package', async () => {
    const analysis = await analyzeProject(fixture('laravel-open-cors'));

    expect(analysis.stack.databases).toContain('postgres');
  });

  /**
   * Only the default. Laravel's file ships every driver it supports in `connections`
   * whether the project uses them or not, so reading those would credit this fixture
   * with sqlite and mysql as well.
   */
  it('does not credit the project with every driver the file mentions', async () => {
    const analysis = await analyzeProject(fixture('laravel-open-cors'));

    expect(analysis.stack.databases).not.toContain('sqlite');
    expect(analysis.stack.databases).not.toContain('mysql');
  });
});

/**
 * ASP.NET Core, whose cross-origin handling is a call to the framework's own builder.
 *
 * `AddCors()` registers the service and `UseCors()` puts it in the pipeline; both
 * names belong to the framework. Jellyfin calls each of them — 1929 C# files — and
 * was told at `high` that it has no cross-origin configuration at all.
 *
 * Which policy it is comes from the builder. Jellyfin ships both branches,
 * `AllowAnyOrigin()` when no hosts are configured and `WithOrigins(...)` when they
 * are, and where both are shipped the open one is what the report should say: it is
 * reachable.
 */
describe('cross-origin handling in ASP.NET Core', () => {
  it('reads an allowlist somebody chose', async () => {
    const report = buildReport(await analyzeProject(fixture('aspnet-chosen-origins')), { profile: 'auto' });

    expect(statusOf(report, 'security.cors-origin')).toBe('passed');
  });

  it('calls AllowAnyOrigin what it is', async () => {
    const report = buildReport(await analyzeProject(fixture('aspnet-open-cors')), { profile: 'auto' });

    expect(statusOf(report, 'security.cors-origin')).toBe('partial');
  });

  it('says nothing about a service that configures none', async () => {
    const report = buildReport(await analyzeProject(fixture('aspnet-api')), { profile: 'auto' });

    expect(statusOf(report, 'security.cors-origin')).toBe('unknown');
  });
});

/**
 * An origin copied back from the request, read as an allowlist.
 *
 * shopizer writes `origin = request.getHeader("origin")` and then
 * `setHeader("Access-Control-Allow-Origin", origin)`. The report said "CORS appears
 * configured with explicit origins" and **passed** it — a clean verdict on the one
 * shape this check exists to catch, on a real e-commerce product.
 *
 * The rule cannot simply be "the value must be a literal": a list kept in an
 * environment variable is still an allowlist. What separates the two is that somebody
 * asks whether the origin belongs before answering yes.
 */
describe('an origin the server copies back', () => {
  it('is not an allowlist', async () => {
    const report = buildReport(await analyzeProject(fixture('java-reflects-the-origin')), { profile: 'auto' });

    expect(statusOf(report, 'security.cors-origin')).toBe('partial');
  });

  it('is still told apart from a list held in an environment variable', async () => {
    const report = buildReport(await analyzeProject(fixture('nextjs-managed-auth')), { profile: 'auto' });

    expect(statusOf(report, 'security.cors-origin')).toBe('passed');
  });

  it('still reads a literal origin as the choice it is', async () => {
    const report = buildReport(await analyzeProject(fixture('express-secure')), { profile: 'auto' });

    expect(statusOf(report, 'security.cors-origin')).toBe('passed');
  });
});
