import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

export async function detectObservability(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const logDeps = hasAnyDep(ctx, ['winston', 'pino', 'morgan', 'bunyan']);
  const sentryDeps = hasAnyDep(ctx, ['@sentry/node', 'sentry-sdk']);
  for (const d of logDeps) evidence.push({ type: 'dependency', value: d, claim: 'logging' });
  for (const d of sentryDeps) evidence.push({ type: 'dependency', value: d, claim: 'logging' });

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/\/(health|healthz|readyz)\b/i, /x-request-id/i, /correlation-id/i, /error\s*handler/i, /RotatingFileHandler/i],
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
    const claim = /\/(health|healthz|readyz)\b/i.test(m.snippet)
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

  const hasHealth = healthFiles.length > 0 || hits.some((h) => /\/(health|healthz|readyz)\b/i.test(h.snippet));
  const hasReqId = hits.some((h) => /x-request-id|correlation-id/i.test(h.snippet));

  // Structured logging without a logging library is still structured logging. What
  // matters is that entries are machine-readable and correlated, not which package
  // produced them.
  const structuredHits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/JSON\.stringify\(\s*\{[^}]*level/i, /logger\.(info|warn|error|debug)\s*\(/, /structuredLog/i],
    15,
  );
  for (const m of structuredHits) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'logging' });
  const hasStructuredLogging = logDeps.length > 0 || structuredHits.length > 0;

  return {
    key: 'observability.core',
    present: hasStructuredLogging || hits.length > 0 || healthFiles.length > 0,
    complete: hasHealth && hasStructuredLogging,
    evidence,
    details: {
      structuredLogging: hasStructuredLogging,
      healthEndpoint: hasHealth,
      requestId: hasReqId,
      sentry: sentryDeps.length > 0,
    },
  };
}
