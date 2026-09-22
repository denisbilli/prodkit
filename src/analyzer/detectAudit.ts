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
  /**
   * A table declared through a migration or schema API rather than in SQL.
   *
   * `plausible/analytics` keeps its trail in `audit_entries`, created by an Ecto
   * migration — `create table(:audit_entries, ...)` — and mapped by
   * `schema "audit_entries"`. Neither is `CREATE TABLE`, and `entries` was not one of
   * the nouns above, so a product that records every team and SSO change was reported
   * as having no audit trail. The call is the framework's and the anchor: Ecto's
   * `table(:x)` and `schema "x"`, Rails' `create_table :x`, Laravel's
   * `Schema::create('x')`, knex's `createTable('x')` and drizzle's `pgTable('x')`. Only
   * the table's name is the author's, and a table whose name says audit is one.
   */
  /\b(?:create_table|createTable|\w+Table|table|schema|Schema::create)\s*\(?\s*[:"'`]\w*audit\w*/i,
];

/** Calls that write an entry. */
const AUDIT_WRITE = [
  /\b(record|write|log|create|append|emit)[A-Z_]?\w*audit\w*\s*\(/i,
  // plausible's repository wraps every audited change: `update_with_audit!(changeset,
  // "team_updated", ...)`, `insert_with_audit!`, `delete_with_audit!`. Elixir and Ruby
  // end a raising or asking call with `!` or `?`, and the verb is a persistence verb.
  /\b(update|insert|delete|save|store|persist)[A-Z_]?\w*audit\w*[!?]?\s*\(/i,
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
const ACTOR_COLUMN = /\b(act_?user\w*|actor\w*|performed_by\w*|changed_by\w*|modified_by\w*|acting_user\w*|moderator\w*)\b/i;
const CALLER_IP_COLUMN = /\b(ip_?address|remote_?addr|client_?ip)\b/i;
const WHEN_COLUMN = /\b\w*_?(date|at|time|timestamp)\b/i;

/** How far apart the three may sit and still be one record: a generous struct or table. */
const WITHIN_ONE_RECORD = 8;

/**
 * The change log that keeps the object as it was and as it became.
 *
 * `netbox-community/netbox` records every create, update and delete in `ObjectChange`:
 * who, when, the request, and `prechange_data` beside `postchange_data`. It has no
 * caller IP, so the signature above never fired, and nothing in it is called audit, so
 * nothing else did either — a product whose changelog is one of its headline features
 * was reported with half an audit trail on the strength of a request-id header.
 *
 * The state before and the state after, kept side by side, is the other signature. A
 * domain model has no use for a copy of some other object's previous state; a record
 * of what changed has no use for anything else. Snake case or `prechange` only, and
 * generic payload nouns only: `oldState` and `newState` are what every reducer names its
 * arguments, and `old_price` is a price. Not after a dot: netbox's data migrations read
 * `objectchange.prechange_data` three times, and a line that reads the record is not
 * where it is kept.
 */
const BEFORE_STATE = /(?<!\.)\b(?:pre_?change_?|before_?change_?|old_|before_)(?:data|values|snapshot|attributes)\b/i;
const AFTER_STATE = /\b(?:post_?change_?|after_?change_?|new_|after_)(?:data|values|snapshot|attributes)\b/i;

/**
 * Who acted, what they did, and why.
 *
 * `lobsters/lobsters` publishes its moderation log: `moderations` keeps
 * `moderator_user_id`, `action`, `reason` and `created_at`, and every moderator action
 * writes a row through `Moderation.new` or `Moderation.create`. No IP, no before and after,
 * nothing called audit, so a site whose public mod log is part of how it governs itself
 * was reported with no trail.
 *
 * A reason beside an action and an actor is the third shape. An activity feed keeps an
 * actor, a verb and a time too — "Ana starred your story" — and does not keep why; a
 * record that has to say why somebody acted is kept to answer for it.
 */
const ACTION_COLUMN = /\baction\b/i;
/**
 * And `reason` declared as a column, not used as a value: lobsters' models assign
 * `self.banned_reason = reason` and `m.reason = reason` all over, and a window around
 * either is code, not a record. A migration's `t.text "reason"` or `add :reason`, a
 * Laravel `$table->text('reason')`, a model field `reason = models.TextField(`, a
 * Prisma or SQL column, a typed field `reason: string`.
 */
const REASON_COLUMN = /^\s*(?:t\.\w+\s+|add\s+|\$table->\w+\(\s*)?["':]?reason["']?\s*(?:$|,|\)|=\s*(?:models|db|sa|fields)\.|=\s*(?:Column|mapped_column)\(|:\s*(?:str|string|text|Optional|Mapped)\b|\s+(?:text|varchar|string)\b)/i;

/** The name a record is declared under, looked for above the line that matched. */
const RECORD_DECLARATION = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:class|struct|model|data\s+class)\s+([A-Za-z_]\w*)/;
/** Rails declares the table and names the model by convention: `moderations` is `Moderation`. */
const RAILS_TABLE = /^\s*create_table\s+["':](\w+?)s?["']?\s*,/;

interface ShapedRecords {
  evidence: DetectorEvidence[];
  /** Names of the records found. */
  names: string[];
}

function recordName(lines: string[], from: number): string | null {
  for (let i = from; i >= 0 && i >= from - 200; i--) {
    const declared = RECORD_DECLARATION.exec(lines[i]);
    if (declared) return declared[1];
    const table = RAILS_TABLE.exec(lines[i]);
    if (table) return table[1].split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  }
  return null;
}

/**
 * What writes to a record, found by the record's own name.
 *
 * netbox writes its change log from a signal handler — `instance.to_objectchange(action)`
 * then `objectchange.save()` — and none of the write patterns know that word. The model
 * that was found does. Loosely only when the name is compound: vaultwarden's is `Event`,
 * and every call mentioning an event is every JavaScript handler in the repository.
 * `ObjectChange` or `AuditEntry` names one thing.
 *
 * A one-word name is searched for only as the ORM spells a new row, in its own case:
 * `Moderation.new`, `Moderation.create!`, `Event::new(`, `Entry.objects.create(`. The
 * browser's `new Event(` is none of them.
 */
function writesTo(name: string): RegExp[] {
  const created = new RegExp(`\\b${name}(?:\\.(?:new|create!?)\\b|::(?:new|create)\\s*\\(|\\.objects\\.create\\s*\\()`);
  if (!/[a-z][A-Z]|_[a-z]/.test(name)) return [created];

  // A line declaring the record is not a write to it, and the name has to end the
  // identifier being called: `ObjectChangeTable(queryset)` reads the log.
  const bare = name.replace(/_/g, '').toLowerCase();
  return [
    created,
    new RegExp(`^(?!\\s*(?:pub\\s+)?(?:class|struct|model|def|fn|import|from)\\b).*\\b\\w*${bare}(?:\\s*\\(|\\.save\\s*\\(|\\.objects\\.create\\s*\\()`, 'i'),
  ];
}

async function auditShapedRecords(ctx: DetectContext, files: string[]): Promise<ShapedRecords> {
  const evidence: DetectorEvidence[] = [];
  const names = new Set<string>();

  for (const file of files) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const window = () => lines.slice(Math.max(0, i - WITHIN_ONE_RECORD), i + WITHIN_ONE_RECORD + 1).join('\n');
      const whoWhenWhere = CALLER_IP_COLUMN.test(lines[i]) && ACTOR_COLUMN.test(window()) && WHEN_COLUMN.test(window());
      const beforeAndAfter = BEFORE_STATE.test(lines[i]) && AFTER_STATE.test(window());
      const whoWhatWhy = REASON_COLUMN.test(lines[i]) && ACTION_COLUMN.test(window()) && ACTOR_COLUMN.test(window()) && WHEN_COLUMN.test(window());
      if (!whoWhenWhere && !beforeAndAfter && !whoWhatWhy) continue;

      if (evidence.length < 5) evidence.push({ type: 'snippet', value: lines[i].trim().slice(0, 200), file, line: i + 1 });
      const name = recordName(lines, i);
      if (name) names.add(name);
      break;
    }
  }

  return { evidence, names: [...names] };
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

  const shaped = await auditShapedRecords(ctx, [...ctx.files.source, ...schemaFiles]);
  const shapedRecords = shaped.evidence;
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
  // The record's own name joins that search (see `writesTo`).
  const writeToNamedRecord = shaped.names.flatMap(writesTo);
  const unnamedWrites = shapedRecords.length > 0
    ? await searchInFiles(ctx.root, ctx.files.source, [/\b(log|record|write|emit|create|append)_?[eE]vents?\s*\(/, ...writeToNamedRecord], 10)
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
