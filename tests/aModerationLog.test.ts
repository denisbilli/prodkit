import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Who acted, what they did, and why.
 *
 * `lobsters/lobsters` publishes its moderation log: `moderations` keeps
 * `moderator_user_id`, `action`, `reason` and `created_at`, and every moderator action
 * writes a row with `Moderation.new` or `Moderation.create!`. No caller IP, no before and
 * after, nothing called audit — a site whose public mod log is part of how it governs
 * itself was reported with no trail.
 */
describe('a moderation log', () => {
  it('recognises the record by an actor, an action and a reason', async () => {
    const analysis = await analyzeProject(fixture('a-moderation-log'));

    expect(analysis.detectors['audit.trail']?.details?.unnamedStore).toBeGreaterThan(0);
  });

  /**
   * `Moderation` is one word, so it is only searched for as the ORM spells a new row,
   * in its own case. Rails names the model after the table by convention.
   */
  it('finds the writes by the model the table names', async () => {
    const analysis = await analyzeProject(fixture('a-moderation-log'));
    const audit = analysis.detectors['audit.trail'];

    expect(audit?.details?.writes).toBe(true);
    expect(audit?.complete).toBe(true);
  });

  /**
   * An activity feed keeps an actor, a verb and a time — "Ana starred your story" — and
   * no reason. And code that assigns `self.hidden_reason = reason` beside an actor and an
   * action is a method, not a record.
   */
  it('is not an activity feed, nor code that handles a reason', async () => {
    const analysis = await analyzeProject(fixture('an-activity-feed-is-not-a-log'));

    expect(analysis.detectors['audit.trail']?.details?.unnamedStore).toBe(0);
    expect(analysis.detectors['audit.trail']?.present).toBe(false);
  });
});
