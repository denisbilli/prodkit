import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * An audit record is identified by what it keeps, not by what it is called.
 *
 * `audit.trail` looked for the word: a table named audit, a model named audit, a call
 * with audit in it. `dani-garcia/vaultwarden` keeps a full trail — a migration creating
 * a table with `event_type`, `act_user_uuid`, `ip_address` and `event_date`, written by
 * `log_event(...)` from every organisation route — and calls all of it `Event`, because
 * Bitwarden named that model and nobody reimplementing its API gets to rename it. It was
 * reported as having no audit trail at all.
 *
 * Three columns together are the signature: who acted, when, and from where. No ordinary
 * domain model needs a caller's IP address beside an actor and a timestamp.
 *
 * The actor must be distinct from the subject, and that is a measurement rather than a
 * preference: with plain `user_id` accepted, the shape also matched vaultwarden's
 * `add_2fa_incomplete`, a table of interrupted logins — a security record, but not a
 * trail of who did what. Restricted to `act_user`, `actor`, `performed_by` and
 * `changed_by`, all nine of its matches are the events table, and across the fixture
 * corpus the shape matches nothing at all.
 */
describe('the audit table not called audit', () => {
  it('recognises the record by who, when and from where', async () => {
    const analysis = await analyzeProject(fixture('the-audit-table-not-called-audit'));
    const audit = analysis.detectors['audit.trail'];

    expect(audit?.present).toBe(true);
    // A store with nothing writing to it is a good intention; `log_event` is the write.
    expect(audit?.complete).toBe(true);
  });

  /**
   * A table of interrupted logins keeps a user, a time and an IP, and is not a trail of
   * who did what — the user in it is the subject, not an actor. vaultwarden has one
   * (`add_2fa_incomplete`) beside its real events table, and with a plain `user_id`
   * accepted as the actor it matched too.
   */
  it('is not a table of login attempts', async () => {
    const analysis = await analyzeProject(fixture('login-attempts-are-not-a-trail'));

    expect(analysis.detectors['audit.trail']?.details?.unnamedStore).toBe(0);
  });

  /**
   * And `emit_event` on an in-process bus writes nothing down. The search for those
   * calls only runs where the shaped store was already found, because on its own it
   * would be a word search over the most common noun in software: this fixture ships
   * `emit_event` and `record_event` and must stay empty-handed.
   */
  it('is not an event bus', async () => {
    const analysis = await analyzeProject(fixture('login-attempts-are-not-a-trail'));
    const audit = analysis.detectors['audit.trail'];

    expect(audit?.details?.writeSites).toBe(0);
    expect(audit?.present).toBe(false);
  });
});

/**
 * PascalCase, which is how C# and Java name a column. bitwarden/server's `Event` has
 * `IpAddress`, `Date` and `ActingUserId`, and `acting_user` wanted an underscore.
 */
describe('an event entity written in C#', () => {
  it('reads who, when and from where in PascalCase', async () => {
    const analysis = await analyzeProject(fixture('aspnet-event-entity'));

    expect(analysis.detectors['audit.trail']?.present).toBe(true);
  });
});

