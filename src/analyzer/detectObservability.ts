import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { searchedFor } from './absenceEvidence';
import { readPackageValueUses } from './structural/valuesFromPackage';

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

export async function detectObservability(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const logDeps = hasAnyDep(ctx, LOGGING_PACKAGES);
  const sentryDeps = hasAnyDep(ctx, ['@sentry/node', 'sentry-sdk']);
  for (const d of logDeps) evidence.push({ type: 'dependency', value: d, claim: 'logging' });
  for (const d of sentryDeps) evidence.push({ type: 'dependency', value: d, claim: 'logging' });

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/\/(health|healthz|readyz|livez|alive)\b/i, /x-request-id/i, /correlation-id/i, /error\s*handler/i, /RotatingFileHandler/i],
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
    const claim = /\/(health|healthz|readyz|livez|alive)\b/i.test(m.snippet)
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

  const hasHealth = healthFiles.length > 0 || hits.some((h) => /\/(health|healthz|readyz|livez|alive)\b/i.test(h.snippet));
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
    evidence.push(...searchedFor('a health endpoint', ['/health', '/healthz', '/readyz', 'a health, healthz, readyz, liveness or readiness route file'], 'health'));
  }
  if (!hasAnyLogging) {
    evidence.push(...searchedFor('logging', ['winston', 'pino', 'morgan', 'bunyan', 'Monolog', 'slog', 'zap', 'logrus', 'slf4j', 'Rails.logger', 'tracing::', 'logger.info/warn/error/debug', 'error_log(', 'JSON.stringify with a level field'], 'logging'));
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
