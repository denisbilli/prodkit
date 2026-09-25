import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyDotnetDep, hasAnyElixirDep, hasAnyGoDep, hasAnyGradleDep, hasAnyPyDep } from './detectContext';
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

/**
 * The other name for the same endpoint.
 *
 * `netbox-community/netbox` answers "is this thing up" at
 * `path('api/status/', StatusView.as_view())` and was reported as having no health
 * endpoint. `/status` is as much a convention as `/health` — it is what GitHub, Stripe
 * and most status pages use — and the list above had five spellings of one word and
 * none of the other.
 *
 * It is separate from `HEALTH_ROUTE` because it has to be quoted to count. `status` is
 * also a field on nearly every JSON response ever written: measured across the fixture
 * corpus, the unquoted form matched `{"status": "ok"}` and `"status": 200` in four
 * fixtures, and the quoted form matches exactly two things — the one fixture with a real
 * `/status` route, and netbox.
 *
 * `/orders/:id/status` is deliberately excluded: the path has to end there, or the
 * status is a thing's rather than the service's.
 */
const SERVICE_STATUS_ROUTE = /["'`](?:\/(?:api\/)?(?:v\d\/)?status\/?|api\/(?:v\d\/)?status\/?)["'`]/;

/**
 * Laravel 11's health route, which the framework serves.
 *
 * `->withRouting(web: ..., health: '/up')` in `bootstrap/app.php` registers an endpoint
 * that answers 200 once the application has booted — every new Laravel application has
 * it. koel declares it and was told at `high` that it has no health endpoint: `/up` is
 * not one of the words the route pattern knows, and it is not meant to be. The named
 * argument is the anchor.
 *
 * Aligned, too: Firefly III writes `health  : '/up',` with its named arguments lined up
 * in a column, and the colon wanted to sit against the name.
 */
const LARAVEL_HEALTH_ROUTE = /^\s*health\s*:\s*['"]\/[\w/-]*['"]/;

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

  /**
   * Go names its logging in go.mod, and the same argument as .NET applies: the module
   * path is the ecosystem's, and a project that imports zerolog logs structurally
   * whatever it calls its own logger.
   */
  const GO_LOGGING_PACKAGES = ['rs/zerolog', 'sirupsen/logrus', 'go.uber.org/zap', 'uber-go/zap', 'phuslu/log'];

  const logDeps = [
    ...hasAnyDep(ctx, LOGGING_PACKAGES),
    ...hasAnyElixirDep(ctx, ELIXIR_LOGGING_PACKAGES),
    ...hasAnyDotnetDep(ctx, DOTNET_LOGGING_PACKAGES),
    ...hasAnyGoDep(ctx, GO_LOGGING_PACKAGES),
  ];
  const sentryDeps = hasAnyDep(ctx, ['@sentry/node', 'sentry-sdk']);
  for (const d of logDeps) evidence.push({ type: 'dependency', value: d, claim: 'logging' });
  for (const d of sentryDeps) evidence.push({ type: 'dependency', value: d, claim: 'logging' });

  /**
   * An import path is not a route.
   *
   * `import Health from 'typings/Health';` is a TypeScript type in Radarr's frontend,
   * and `/Health'` matches the route pattern exactly as `/health` in a URL does. It
   * was the evidence behind Radarr's passing health check — a false pass, which is
   * the direction that raises a score rather than lowering one.
   *
   * Imports are good evidence elsewhere and are left alone there; this is the search
   * for a *route*, and a module specifier is never one. Filtered inside the search so
   * that a frontend full of them cannot spend the budget before a real route is
   * reached.
   */
  const IMPORT_LINE = /^\s*(?:import\b|from\s+['"]|const\s+\{?[\w\s,}]*\}?\s*=\s*require\()/;

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [HEALTH_ROUTE, SERVICE_STATUS_ROUTE, LARAVEL_HEALTH_ROUTE, /x-request-id/i, /correlation-id/i, /error\s*handler/i, /RotatingFileHandler/i],
    25,
    (match) => !IMPORT_LINE.test(match.snippet),
  );
  /**
   * One search, three answers, so the claim is decided per hit rather than per search.
   *
   * A `logger.debug(...)` line was being cited as the evidence for a missing health
   * endpoint, which is not an argument about health at all. Whichever pattern matched
   * is what the line is evidence of.
   */
  for (const m of hits) {
    const claim = HEALTH_ROUTE.test(m.snippet) || SERVICE_STATUS_ROUTE.test(m.snippet) || LARAVEL_HEALTH_ROUTE.test(m.snippet)
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
    || hits.some((h) => HEALTH_ROUTE.test(h.snippet) || SERVICE_STATUS_ROUTE.test(h.snippet) || LARAVEL_HEALTH_ROUTE.test(h.snippet));
  /**
   * Whether one log line can be tied to the request that produced it.
   *
   * This read `x-request-id|correlation-id` over the snippets the health-and-logging
   * search had already collected — two hyphenated spellings, inside a search that was
   * looking for something else. Five of the seven repositories in `npm run wild` came
   * out `observability.logging: partial` on it, and cal.com is the case that shows why:
   * `packages/lib/tracing/index.ts` builds `traceId`, `spanId` and `parentSpanId` for
   * every operation and threads them through a `tslog` logger. It correlates. It just
   * does not spell it with a hyphen, and nothing was looking in that file anyway.
   *
   * The two anchors below are not words anybody chose. `traceparent` and `x-b3-traceid`
   * are wire formats — W3C Trace Context and B3 — and `spanId` beside `traceId` is
   * OpenTelemetry's own vocabulary: a span is not a thing people name by accident, and
   * requiring it keeps `traceId` from matching the identifier Stripe and AWS hand back
   * on an unrelated call.
   */
  const CORRELATION = [
    /x-request-id|x-correlation-id|\bcorrelation[-_]?id\b/i,
    /\btraceparent\b|x-b3-traceid|x-amzn-trace-id/i,
    /\bspan[-_]?id\b/i,
    /@opentelemetry\/|\btrace\.getActiveSpan\b|\bSpanContext\b/,
    /**
     * Rails tags every line itself when told to.
     *
     * `config.log_tags = [:request_id]` prefixes each log line with the id
     * `ActionDispatch::RequestId` assigned the request — correlation, configured rather
     * than written. `chatwoot/chatwoot` has it in production.rb and was `partial` for want
     * of a hyphenated header name. `:request_id` is Rails' symbol for that id, not the
     * author's.
     */
    /\blog_tags\s*=.*:request_id\b/,
  ];
  const correlationHits = await searchInFiles(ctx.root, ctx.files.source, CORRELATION, 10);
  const correlationDeps = hasAnyDep(ctx, [
    'cls-rtracer', 'express-request-id', 'pino-http', 'nestjs-pino', '@opentelemetry/api', '@opentelemetry/sdk-node',
  ]);
  const correlationPyDeps = hasAnyPyDep(ctx, ['django-guid', 'asgi-correlation-id', 'opentelemetry-api', 'opentelemetry-sdk']);

  const hasReqId = correlationHits.length > 0
    || correlationDeps.length + correlationPyDeps.length > 0
    || hits.some((h) => /x-request-id|correlation-id/i.test(h.snippet));

  for (const hit of correlationHits.slice(0, 3)) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line, claim: 'logging' });
  }
  for (const dep of [...correlationDeps, ...correlationPyDeps]) {
    evidence.push({ type: 'dependency', value: dep, claim: 'logging' });
  }

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
      /**
       * zerolog builds the entry instead of formatting it.
       *
       * `log.Error().Err(err).Msg("Error updating last used")` is how gotify logs
       * every line of its Go server, and none of the shapes beside this one is a
       * chain: they all expect the level to take the message. gotify's logging was
       * read from `console.error` in its React admin instead — the frontend
       * describing a failed delete, offered as how the server records what happened.
       *
       * `.Msg(` and `.Msgf(` after a level are zerolog's and zap's sugared API both,
       * and neither is a name the author chose.
       */
      /\b(?:log|logger)\.(?:Info|Warn|Warning|Error|Debug|Fatal|Trace)\(\)(?:\.\w+\([^)]*\))*\.Msgf?\(/,
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
