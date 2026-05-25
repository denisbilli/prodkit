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

  const hasHealth = hits.some((h) => /\/(health|healthz|readyz)\b/i.test(h.snippet));
  const hasReqId = hits.some((h) => /x-request-id|correlation-id/i.test(h.snippet));

  return {
    key: 'observability.core',
    present: logDeps.length > 0 || hits.length > 0,
    complete: hasHealth && logDeps.length > 0,
    evidence,
    details: {
      structuredLogging: logDeps.length > 0,
      healthEndpoint: hasHealth,
      requestId: hasReqId,
      sentry: sentryDeps.length > 0,
    },
  };
}
