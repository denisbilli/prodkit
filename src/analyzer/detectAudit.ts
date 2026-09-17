import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { readTextFileSafe } from '../utils/readTextFileSafe';

/**
 * A durable record of who did what.
 *
 * This is not observability, and conflating the two was the bug this replaces:
 * `audit.baseline` was evaluated from structured logging and a request id, which
 * answer "can we debug this?" rather than "can we say, months later, who deleted that
 * organisation?". Logs rotate; an audit trail is meant not to.
 *
 * Two kinds of evidence, in order of strength. A place to keep the record — a table or
 * a model whose name says what it is — and calls that write to it. A table with
 * nothing writing to it is a good intention; writes with no durable store behind them
 * are log lines.
 */

const AUDIT_DEPS = ['audit-log', '@casl/ability', 'express-winston'];
const AUDIT_PY_DEPS = ['django-auditlog', 'django-simple-history', 'sqlalchemy-continuum'];

/** A table or model that exists to hold the record. */
const AUDIT_STORE = [
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?\w*audit\w*/i,
  /\bmodel\s+\w*Audit\w*\s*\{/i,
  /class\s+\w*Audit(?:Log|Event|Trail)\w*\b/i,
  /\b(audit_events?|audit_logs?|auditlog|audit_trail)\b/i,
];

/** Calls that write an entry. */
const AUDIT_WRITE = [
  /\b(record|write|log|create|append|emit)[A-Z_]?\w*audit\w*\s*\(/i,
  /\baudit[._]?(log|event|trail)\s*\(/i,
  /\bauditLog\s*\(/,
  /\blog_audit\b/i,
];

export async function detectAudit(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const deps = [...hasAnyDep(ctx, AUDIT_DEPS), ...hasAnyPyDep(ctx, AUDIT_PY_DEPS)];
  for (const dep of deps) evidence.push({ type: 'dependency', value: dep });

  // Schema and migration files are where a store is declared, and the analyzer
  // classifies them as neither source nor config, so they are taken from `all`.
  const schemaFiles = ctx.files.all.filter((file) =>
    /(^|\/)(schema\.prisma|.*schema\.[cm]?[jt]s|.*\.sql)$/i.test(file)
  );

  const storeHits = await searchInFiles(ctx.root, [...ctx.files.source, ...schemaFiles], AUDIT_STORE, 15);
  for (const hit of storeHits) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  const writeHits = await searchInFiles(ctx.root, ctx.files.source, AUDIT_WRITE, 15);
  for (const hit of writeHits) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  const hasStore = storeHits.length > 0 || deps.length > 0;
  const hasWrites = writeHits.length > 0;

  // `complete` is what lets the expectation say `present` rather than `partial`: a
  // store that is written to is a working audit trail, and either half alone is not.
  return {
    key: 'audit.trail',
    present: hasStore || hasWrites,
    complete: hasStore && hasWrites,
    evidence,
    details: { store: hasStore, writes: hasWrites, writeSites: writeHits.length },
  };
}
