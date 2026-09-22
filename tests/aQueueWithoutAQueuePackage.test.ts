import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A queue is a table that several workers take rows from without taking the same row.
 *
 * `open-webui/open-webui` runs automations and chat timers from a loop its lifespan
 * starts: claim due rows with `with_for_update(skip_locked=True)`, mark them running,
 * execute them. No queue package, no task decorator, no worker service in compose — and
 * it was reported as having no background work at all.
 *
 * `SKIP LOCKED` is the database's word, and it has one use.
 */
describe('a queue without a queue package', () => {
  it('recognises rows claimed with SKIP LOCKED', async () => {
    const analysis = await analyzeProject(fixture('a-queue-without-a-queue-package'));

    expect(analysis.detectors['jobs.background']?.present).toBe(true);
  });

  /**
   * A row lock that waits is a transaction, not a queue: a transfer must never skip the
   * row it wants. And the clause named in a comment is somebody deciding against it.
   */
  it('is not any row lock, nor the clause in a comment', async () => {
    const analysis = await analyzeProject(fixture('row-locks-are-not-all-queues'));

    expect(analysis.detectors['jobs.background']?.present).toBe(false);
  });
});
