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

/**
 * The audit table that is not called audit.
 *
 * Everything above looks for the word. `dani-garcia/vaultwarden` keeps a full trail —
 * `src/db/models/event.rs` and a migration creating a table with `event_type`,
 * `act_user_uuid`, `ip_address` and `event_date`, written by `log_event(...)` from every
 * organisation route — and calls all of it `Event`, so it was reported as having no
 * audit trail at all. Bitwarden named that model, and nobody writing a Rust password
 * server gets to rename it.
 *
 * What identifies an audit record is not its name but the three columns it keeps
 * together: who acted, when, and from where. No ordinary domain model needs a caller's
 * IP address beside an actor and a timestamp — there is nothing else to do with that
 * combination.
 *
 * The actor has to be distinct from the subject. Measured on vaultwarden: with plain
 * `user_id` accepted, the signature also matched `add_2fa_incomplete`, a table of
 * interrupted logins, which is a security record but not a trail of who did what. With
 * `act_user`, `actor`, `performed_by` and `changed_by` only, all nine matches are the
 * events table. Across 247 fixtures it matches nothing at all, which is the other half
 * of the measurement: no fixture writes this shape by accident.
 */
const ACTOR_COLUMN = /\b(act_?user\w*|actor\w*|performed_by\w*|changed_by\w*|modified_by\w*|acting_user\w*)\b/i;
const CALLER_IP_COLUMN = /\b(ip_?address|remote_?addr|client_?ip)\b/i;
const WHEN_COLUMN = /\b\w*_?(date|at|time|timestamp)\b/i;

/** How far apart the three may sit and still be one record: a generous struct or table. */
const WITHIN_ONE_RECORD = 8;

async function auditShapedRecords(ctx: DetectContext, files: string[]): Promise<DetectorEvidence[]> {
  const found: DetectorEvidence[] = [];

  for (const file of files) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!CALLER_IP_COLUMN.test(lines[i])) continue;

      const record = lines.slice(Math.max(0, i - WITHIN_ONE_RECORD), i + WITHIN_ONE_RECORD + 1).join('\n');
      if (!ACTOR_COLUMN.test(record) || !WHEN_COLUMN.test(record)) continue;

      found.push({ type: 'snippet', value: lines[i].trim().slice(0, 200), file, line: i + 1 });
      break;
    }
    if (found.length >= 5) break;
  }

  return found;
}

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

  const shapedRecords = await auditShapedRecords(ctx, [...ctx.files.source, ...schemaFiles]);
  for (const record of shapedRecords) evidence.push(record);

  /**
   * What writes to a store that is not called audit.
   *
   * vaultwarden's is `log_event(...)`, called from every organisation route, and the
   * write patterns above all require the word `audit`. So the store was found and the
   * trail still read as half-built: a table with nothing writing to it, which is exactly
   * the thing this detector separates a good intention from.
   *
   * `emitEvent` and `recordEvent` are ordinary in any codebase with an event bus, so
   * this only counts where the shaped store was already found. On its own it would be a
   * word search over the most common noun in software; behind that gate it is the second
   * half of one specific finding.
   */
  const unnamedWrites = shapedRecords.length > 0
    ? await searchInFiles(ctx.root, ctx.files.source, [/\b(log|record|write|emit|create|append)_?[eE]vents?\s*\(/], 10)
    : [];
  for (const hit of unnamedWrites) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  const hasStore = storeHits.length > 0 || deps.length > 0 || shapedRecords.length > 0;
  const hasWrites = writeHits.length > 0 || unnamedWrites.length > 0;

  // `complete` is what lets the expectation say `present` rather than `partial`: a
  // store that is written to is a working audit trail, and either half alone is not.
  return {
    key: 'audit.trail',
    present: hasStore || hasWrites,
    complete: hasStore && hasWrites,
    evidence,
    details: { store: hasStore, writes: hasWrites, writeSites: writeHits.length + unnamedWrites.length, unnamedStore: shapedRecords.length },
  };
}
