import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

export async function detectObservability(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const logDeps = hasAnyDep(ctx, ['winston', 'pino', 'morgan', 'bunyan']);
  const sentryDeps = hasAnyDep(ctx, ['@sentry/node', 'sentry-sdk']);
  for (const d of logDeps) evidence.push({ type: 'dependency', value: d });
  for (const d of sentryDeps) evidence.push({ type: 'dependency', value: d });

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/\/(health|healthz|readyz)\b/i, /x-request-id/i, /correlation-id/i, /error\s*handler/i, /RotatingFileHandler/i],
    25
  );
  for (const m of hits) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  // A file-routing framework declares the endpoint as a path, not as a string in
  // source: Next's app/api/health/route.ts contains no "/health" to match. Searching
  // only the text reports hardened applications as having no health check.
  const healthFiles = ctx.files.all.filter((file) =>
    /(^|\/)(health|healthz|readyz|liveness|readiness)(\/route|\.[a-z]+)?$|(^|\/)(health|healthz|readyz)\//i.test(file),
  );
  for (const file of healthFiles) evidence.push({ type: 'file', value: file });

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
  for (const m of structuredHits) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
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
