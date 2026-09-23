import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A record is the whole model, not eight lines of it.
 *
 * `outline/outline` keeps its audit trail in an `events` model that declares `ip` on line
 * 51 and `actorId` on line 118, and writes it with `Event.create`. The who-when-where shape
 * looked eight lines either side of the IP and never saw the actor, and a column called
 * just `ip` was not an IP column at all. Now the shape reads the enclosing class or table,
 * and `ip` counts where a record declares it with a type.
 */
describe('a model longer than a window', () => {
  it('finds actor, time and IP across a decorated model', async () => {
    const analysis = await analyzeProject(fixture('a-model-longer-than-a-window'));
    const audit = analysis.detectors['audit.trail'];

    expect(audit?.details?.unnamedStore).toBeGreaterThan(0);
    expect(audit?.complete).toBe(true);
  });

  /**
   * A session keeps an IP, a user and a time — the user is its subject, not an actor. And
   * a payload that copies `ip: event.ip` is a value, not a column.
   */
  it('is not a session, nor a payload carrying the IP along', async () => {
    const analysis = await analyzeProject(fixture('sessions-and-payloads-are-not-trails'));

    expect(analysis.detectors['audit.trail']?.details?.unnamedStore).toBe(0);
  });
});
