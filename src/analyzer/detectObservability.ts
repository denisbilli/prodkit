import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyDotnetDep, hasAnyElixirDep, hasAnyGradleDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { searchedFor } from './absenceEvidence';
import { readPackageValueUses } from './structural/valuesFromPackage';
import { readTextFileSafe } from '../utils/readTextFileSafe';

/**
 * Logging packages, which the ecosystem names and the author does not.
 *
 * The list was four long and the search beside it read `logger.` — the author's own
 * variable. A repository using Roarr, bound to `shout`, was reported as having no
 * logging at all: wrong package, wrong variable, two ways to miss the same thing.
 *
 * A list of package names is still a list, but it is a list of names nobody in the
 * repository being analysed chose. That is the difference the whole exercise is about.
 */
const LOGGING_PACKAGES = [
  'winston',
  'pino',
  'morgan',
  'bunyan',
  'roarr',
  'loglevel',
  'signale',
  'consola',
  'tslog',
  'log4js',
  '@logtail/node',
  'debug',
  'npmlog',
];

/** Elixir reaches for a backend rather than a logger: Logger itself is in OTP. */
const ELIXIR_LOGGING_PACKAGES = ['logger_json', 'logger_file_backend', 'sentry'];

/**
 * The route, in every spelling somebody writes it.
 *
 * `\/(health|healthz|readyz|livez|alive)\b` does not match `/healthcheck`: after
 * `health` comes a `c`, and the boundary fails. Netflix's dispatch declares
 * `@api_router.get("/healthcheck")` and was told it has no health endpoint — the
 * plainest spelling there is, missed by the pattern meant to find it.
 *
 * This does not disturb the decision recorded below about Dropwizard. That one is
 * about an endpoint the *framework* publishes, which no Dropwizard application writes
 * in its own source; a line like dispatch's is somebody declaring the route
 * themselves.
 */
const HEALTH_ROUTE = /\/(health|healthz|healthcheck|health[-_]check|readyz|livez|alive)\b/i;

export async function detectObservability(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  /**
   * .NET names its logging in the project file and nothing here was reading it.
   *
   * Radarr declares `NLog`, `NLog.Extensions.Logging` and
   * `NLog.Layouts.ClefJsonLayout` — CLEF being the compact JSON event format — and
   * was reported as logging something but not structurally. The npm list has had
   * winston and pino since the beginning and treats the dependency alone as enough;
   * these are the same statement in another manifest.
   */
  const DOTNET_LOGGING_PACKAGES = ['NLog', 'NLog.Extensions.Logging', 'Serilog', 'Serilog.AspNetCore', 'Microsoft.Extensions.Logging', 'log4net'];

  const logDeps = [
    ...hasAnyDep(ctx, LOGGING_PACKAGES),
    ...hasAnyElixirDep(ctx, ELIXIR_LOGGING_PACKAGES),
    ...hasAnyDotnetDep(ctx, DOTNET_LOGGING_PACKAGES),
  ];
  const sentryDeps = hasAnyDep(ctx, ['@sentry/node', 'sentry-sdk']);
  for (const d of logDeps) evidence.push({ type: 'dependency', value: d, claim: 'logging' });
  for (const d of sentryDeps) evidence.push({ type: 'dependency', value: d, claim: 'logging' });

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [HEALTH_ROUTE, /x-request-id/i, /correlation-id/i, /error\s*handler/i, /RotatingFileHandler/i],
    25
  );
  /**
   * One search, three answers, so the claim is decided per hit rather than per search.
   *
   * A `logger.debug(...)` line was being cited as the evidence for a missing health
   * endpoint, which is not an argument about health at all. Whichever pattern matched
   * is what the line is evidence of.
   */
  for (const m of hits) {
    const claim = HEALTH_ROUTE.test(m.snippet)
      ? 'health'
      : /x-request-id|correlation-id/i.test(m.snippet)
        ? 'request-id'
        : 'logging';
    evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim });
  }

  // A file-routing framework declares the endpoint as a path, not as a string in
  // source: Next's app/api/health/route.ts contains no "/health" to match. Searching
  // only the text reports hardened applications as having no health check.
  const healthFiles = ctx.files.all.filter((file) =>
    /(^|\/)(health|healthz|readyz|liveness|readiness)(\/route|\.[a-z]+)?$|(^|\/)(health|healthz|readyz)\//i.test(file),
  );
  for (const file of healthFiles) evidence.push({ type: 'file', value: file, claim: 'health' });

  /**
   * Spring Boot Actuator, which is the endpoint rather than a route to it.
   *
   * Adding `spring-boot-starter-actuator` publishes `/actuator/health` — exposed by
   * default, with no route written anywhere — so a project that has it cannot be
   * found by searching for a path. spring-petclinic declares it in both its pom and
   * its build.gradle and was reported as having no health endpoint.
   *
   * A deliberate dependency, unlike two things this file and its neighbour decline to
   * count: Dropwizard's admin `/healthcheck`, which every Dropwizard application has
   * for being Dropwizard, and Django's `SecurityMiddleware`, which `startproject`
   * writes into every new project. Actuator is in no Spring application by default.
   */
  const actuator = hasAnyGradleDep(ctx, ['spring-boot-starter-actuator']);
  for (const dep of actuator) evidence.push({ type: 'dependency', value: dep, claim: 'health' });

  /**
   * The probe a platform declares, which is the operator's half of the same answer.
   *
   * immich declares `healthcheck:` for its services in all four of its compose files
   * and was told it has no health endpoint. Something is being probed — that is what
   * the key means — and the endpoint it probes is inside the image, where no text
   * search here will find it.
   *
   * `HEALTHCHECK` is Docker's instruction, `healthcheck:` is compose's key, and
   * `livenessProbe:` and `readinessProbe:` are Kubernetes' field names. None is the
   * author's word, and each one is a statement that this service answers a health
   * question.
   *
   * `disable: true` is the one that says the opposite — compose's way of switching
   * off an image's own check — so a block carrying it is not counted.
   */
  const deploymentManifests = ctx.files.all.filter((file) =>
    /(^|\/)(docker-compose[\w.-]*\.ya?ml|compose[\w.-]*\.ya?ml|Dockerfile[\w.-]*)$/.test(file)
    || /(^|\/)(k8s|kubernetes|helm|deploy|charts)\/.*\.ya?ml$/i.test(file),
  ).slice(0, 12);

  const declaredProbes: DetectorEvidence[] = [];
  for (const file of deploymentManifests) {
    const text = (await readTextFileSafe(ctx.root, file)) ?? '';
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*(?:HEALTHCHECK\s|healthcheck\s*:|livenessProbe\s*:|readinessProbe\s*:)/.test(lines[i])) continue;
      /** compose writes `healthcheck:` then `disable: true` to switch the image's own off. */
      if (lines.slice(i + 1, i + 3).some((line) => /^\s*disable\s*:\s*true/.test(line))) continue;

      declaredProbes.push({ type: 'snippet', value: lines[i].trim().slice(0, 200), file, line: i + 1, claim: 'health' });
      break;
    }
  }
  for (const probe of declaredProbes.slice(0, 3)) evidence.push(probe);

  const hasHealth = declaredProbes.length > 0
    || healthFiles.length > 0
    || actuator.length > 0
    || hits.some((h) => HEALTH_ROUTE.test(h.snippet));
  const hasReqId = hits.some((h) => /x-request-id|correlation-id/i.test(h.snippet));

  // Structured logging without a logging library is still structured logging. What
  // matters is that entries are machine-readable and correlated, not which package
  // produced them.
  const structuredHits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      /JSON\.stringify\(\s*\{[^}]*level/i,
      /logger\.(info|warn|error|debug)\s*\(/,
      /structuredLog/i,
      /**
       * The same idea in the languages this was blind to.
       *
       * It looked for `logger.info(` and a JSON.stringify with a level field, which are
       * JavaScript and Python idioms, and reported "no structured logging dependency
       * detected" about a PHP application whose global exception handler logs every
       * exception. Go, Java, Ruby and Rust were invisible for the same reason.
       */
      /Monolog\\Logger|LoggerInterface|->(info|warning|error|debug)\(/,
      /\bslog\.(Info|Warn|Error|Debug)\(|\bzap\.|\blogrus\.|\blog\.Printf\(/,
      /LoggerFactory\.getLogger|org\.slf4j/,
      /Rails\.logger/,
      /\btracing::(info|warn|error|debug)!|\blog::(info|warn|error)!/,
      /**
       * Elixir's, which is one module in the standard library.
       *
       * `Logger.info(...)` is how every Phoenix application logs, and `Logger` is
       * OTP's name rather than anybody's variable.
       */
      /\bLogger\.(info|warning|warn|error|debug|notice)\(/,
    ],
    15,
  );
  for (const m of structuredHits) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'logging' });

  /**
   * Logging at all, as distinct from logging something a machine can read.
   *
   * `error_log($e)` is a real answer to "will we know this happened", and a different
   * answer from Monolog with a request id. Reporting the first as nothing to show made
   * the finding wrong; reporting it as structured would make the recommendation wrong.
   * It is `partial`, and now it can be said.
   */
  const plainLogging = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/\berror_log\s*\(/, /\bsyslog\s*\(/, /console\.(error|warn)\s*\(/, /\bprintStackTrace\s*\(/],
    10,
  );
  for (const m of plainLogging) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'logging' });

  /**
   * Where a value from a logging package is used, whatever it was called.
   *
   * `const shout = Roarr.child(...)` then `shout.info(...)` is structured logging, and
   * the text search cannot see it because `shout` is a name its author invented. The
   * import is the anchor and the binding is the chain.
   *
   * Evidence, not verdict, and the distinction is measured rather than assumed. This
   * walk can only fire where one of the packages above is imported, and a package that
   * is imported is a package the manifest declares — workspace manifests included, as
   * a monorepo fixture confirmed. So it never changes the answer, and the clause that
   * pretended it might was removed rather than left to look load-bearing.
   *
   * What it does change is what the reader is shown: "pino is in your package.json"
   * becomes "pino is used at server.js:8". The claim was always about the second.
   */
  const boundLoggerUses = await readPackageValueUses(ctx.root, ctx.files.source, LOGGING_PACKAGES);
  for (const use of (boundLoggerUses ?? []).slice(0, 10)) {
    evidence.push({ type: 'file', value: `a logger from ${logDeps[0] ?? 'a logging package'} is used here`, file: use.file, line: use.line, claim: 'logging' });
  }

  const hasStructuredLogging = logDeps.length > 0 || structuredHits.length > 0;
  const hasAnyLogging = hasStructuredLogging || plainLogging.length > 0;

  if (!hasHealth) {
    evidence.push(...searchedFor('a health endpoint', ['/health', '/healthz', '/readyz', 'a health, healthz, readyz, liveness or readiness route file', 'a HEALTHCHECK, a compose healthcheck or a Kubernetes liveness probe'], 'health'));
  }
  if (!hasAnyLogging) {
    evidence.push(...searchedFor('logging', ['winston', 'pino', 'morgan', 'bunyan', 'Monolog', 'slog', 'zap', 'logrus', 'slf4j', 'Rails.logger', 'tracing::', 'logger.info/warn/error/debug', 'Logger.info', 'error_log(', 'JSON.stringify with a level field'], 'logging'));
  }

  return {
    key: 'observability.core',
    present: hasAnyLogging || hits.length > 0 || healthFiles.length > 0,
    complete: hasHealth && hasStructuredLogging,
    evidence,
    details: {
      structuredLogging: hasStructuredLogging,
      /** Any logging at all, structured or not. */
      anyLogging: hasAnyLogging,
      healthEndpoint: hasHealth,
      requestId: hasReqId,
      sentry: sentryDeps.length > 0,
    },
  };
}
