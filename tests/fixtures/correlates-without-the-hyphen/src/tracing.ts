import { Logger } from 'tslog';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
}

export class DistributedTracing {
  constructor(private readonly log: Logger<unknown>) {}

  createTrace(operation: string, parent?: TraceContext): TraceContext {
    return {
      traceId: parent?.traceId ?? `trace_${crypto.randomUUID()}`,
      spanId: `span_${crypto.randomUUID()}`,
      parentSpanId: parent?.spanId,
      operation,
    };
  }

  info(context: TraceContext, message: string): void {
    this.log.info({ traceId: context.traceId, spanId: context.spanId, operation: context.operation }, message);
  }
}
