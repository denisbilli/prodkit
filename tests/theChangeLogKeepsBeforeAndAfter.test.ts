import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A change log keeps the object as it was and as it became.
 *
 * `netbox-community/netbox` records every create, update and delete in `ObjectChange` —
 * who, when, the request, and `prechange_data` beside `postchange_data` — and writes it
 * from a signal handler through `instance.to_objectchange(action)` and
 * `objectchange.save()`. There is no caller IP in it, so the who-when-where signature
 * never fired, and nothing in it is called audit. A product whose changelog is a
 * headline feature was reported with half an audit trail, on the strength of a
 * request-id header.
 */
describe('the change log keeps before and after', () => {
  it('recognises the record by the two states it keeps', async () => {
    const analysis = await analyzeProject(fixture('django-change-log'));

    expect(analysis.detectors['audit.trail']?.details?.unnamedStore).toBeGreaterThan(0);
  });

  it('finds the writes through the name of the record it found', async () => {
    const analysis = await analyzeProject(fixture('django-change-log'));
    const audit = analysis.detectors['audit.trail'];

    expect(audit?.details?.writes).toBe(true);
    expect(audit?.complete).toBe(true);
    // `class ObjectChange(models.Model)` declares the record; it does not write to it.
    expect(audit?.evidence.some((e) => /class ObjectChange/.test(e.value))).toBe(false);
    // Nor does a table that lists it: the name has to end the identifier being called.
    expect(audit?.evidence.some((e) => /ObjectChangeTable\(/.test(e.value))).toBe(false);
  });

  /**
   * A reducer names its arguments `oldState` and `newState`, a price change keeps
   * `old_price` and `new_price`, and code that reads `record.old_values` is using a log,
   * not keeping one. None of them is a record of who changed what.
   */
  it('is not a reducer, a price or a reader', async () => {
    const analysis = await analyzeProject(fixture('before-and-after-is-not-always-a-log'));

    expect(analysis.detectors['audit.trail']?.details?.unnamedStore).toBe(0);
    expect(analysis.detectors['audit.trail']?.present).toBe(false);
  });

  /**
   * The record's name is only searched for when it is compound. A log called `Change`
   * would turn every `handle_change(` in the repository into a write to it; vaultwarden's
   * is called `Event`, which is worse. This one is found, and nothing writes to it.
   */
  it('does not search for a one-word name', async () => {
    const analysis = await analyzeProject(fixture('a-one-word-log-is-not-a-search-term'));
    const audit = analysis.detectors['audit.trail'];

    expect(audit?.details?.unnamedStore).toBeGreaterThan(0);
    expect(audit?.details?.writes).toBe(false);
  });
});
