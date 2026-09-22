import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Correlation is not spelled with a hyphen.
 *
 * `observability.logging` asked whether a log line can be tied back to the request that
 * produced it, and answered by looking for `x-request-id` or `correlation-id` inside the
 * snippets a *different* search had already collected — two hyphenated spellings, in
 * files nothing had a reason to be reading.
 *
 * Five of the seven repositories in `npm run wild` came out `partial` on it. cal.com is
 * the case that shows why: `packages/lib/tracing/index.ts` builds `traceId`, `spanId`
 * and `parentSpanId` for every operation and threads them through a tslog logger. It
 * correlates. open-webui declares `opentelemetry-api` and puts `span_id` on every line.
 *
 * `traceparent` and `x-b3-traceid` are wire formats; a span is OpenTelemetry's own
 * vocabulary. Requiring `spanId` rather than `traceId` alone keeps this off the
 * identifier Stripe and AWS hand back on an unrelated call.
 */
describe('the log that knows which request', () => {
  it('reads correlation off a span, not off a hyphen', async () => {
    const report = buildReport(await analyzeProject(fixture('correlates-without-the-hyphen')), { profile: 'b2b-saas' });
    const logging = report.productProfile?.capabilities.find((c) => c.capabilityId === 'observability.logging');

    expect(logging?.status).toBe('present');
  });
});
