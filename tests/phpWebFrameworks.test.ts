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

/**
 * Spring Security writes the headers without being asked.
 *
 * Adding `spring-boot-starter-security` and configuring an `HttpSecurity` chain gives
 * every response `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and a
 * no-store `Cache-Control` — the framework's defaults, applied whether or not anybody
 * writes a line about headers. shopizer does exactly that and was told it has none.
 *
 * Django's `SecurityMiddleware` is deliberately still not counted, and the difference
 * is the point: `django-admin startproject` writes that into every new project, so it
 * distinguishes nothing, and its nosniff and HSTS behaviour waits on `SECURE_*`
 * settings. This starter is in no Spring project by default — petclinic has no
 * security at all — and its defaults need no settings.
 */
describe('security headers a framework sets by itself', () => {
  it('credits a configured Spring Security filter chain', async () => {
    const analysis = await analyzeProject(fixture('spring-security-defaults'));

    expect(analysis.detectors['security.core']?.details?.helmet).toBe(true);
  });

  /**
   * Both halves are required. A project can pull the starter for method-level
   * authorization in something that serves no requests, and then there is no filter
   * chain and no headers.
   */
  it('does not credit the dependency on its own', async () => {
    const analysis = await analyzeProject(fixture('spring-security-method-only'));

    expect(analysis.detectors['security.core']?.details?.helmet).toBe(false);
  });
});

/**
 * Everything after `src/main/java` is a package name, not a project layout.
 *
 * spring-petclinic lives in `org.springframework.samples.petclinic`, so every one of
 * its thirty Java files sits under a path segment called `samples` — and the rule
 * that removes sample code removed the whole application. The report saw a project
 * with no Java in it: twelve files, an HTML front end, no backend, and `client-app`
 * at high confidence for a Spring Boot server.
 *
 * Maven and Gradle both fix that prefix, so the segments after it are the author's
 * package. A real sample directory sits beside `src`, not inside its source root.
 */
describe('a package called samples is not a samples directory', () => {
  it('reads an application whose package name contains samples', async () => {
    const analysis = await analyzeProject(fixture('spring-in-a-samples-package'));

    expect(analysis.files.source.length).toBeGreaterThan(0);
    expect(analysis.stack.backend).toContain('spring-boot');
  });

  it('still removes snippets that sit beside the source root', async () => {
    const analysis = await analyzeProject(fixture('jvm-docs-with-snippets'));

    expect(analysis.files.source).toHaveLength(0);
  });
});

/**
 * Spring Boot Actuator is the endpoint rather than a route to one.
 *
 * Adding `spring-boot-starter-actuator` publishes `/actuator/health`, exposed by
 * default with no route written anywhere, so a project that has it cannot be found by
 * searching for a path. spring-petclinic declares it in both its pom and its
 * build.gradle and was reported as having no health endpoint.
 *
 * A deliberate dependency, unlike two this analyzer declines to count: Dropwizard's
 * admin `/healthcheck`, which every Dropwizard application has for being Dropwizard,
 * and Django's `SecurityMiddleware`, which `startproject` writes into every project.
 */
describe('the health endpoint a dependency publishes', () => {
  it('is credited to a project that adds Actuator', async () => {
    const analysis = await analyzeProject(fixture('spring-in-a-samples-package'));

    expect(analysis.detectors['observability.core']?.details?.healthEndpoint).toBe(true);
  });

  it('is not credited to a Spring project without it', async () => {
    const analysis = await analyzeProject(fixture('spring-security-defaults'));

    expect(analysis.detectors['observability.core']?.details?.healthEndpoint).toBe(false);
  });
});
