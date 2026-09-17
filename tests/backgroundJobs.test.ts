import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);
const jobs = async (name: string) => (await analyzeProject(fixture(name))).detectors['jobs.background'];

describe('background jobs', () => {
  it('does not mistake a breadth-first search for a job system', async () => {
    // The measured false positive, reproduced: a pirate game was reported as having
    // background jobs because of `queue: deque[tuple[int, int]] = deque()` in a flood
    // fill, and that alone was then enough to have the project judged as an AI SaaS.
    const result = await jobs('python-bfs-queue');

    expect(result?.present).toBe(false);
  });

  it('recognises a worker declared as a process rather than as a library', async () => {
    // A hand-rolled worker polling Postgres has no dependency and no decorator. What
    // it has, like any shipped worker, is something that starts it. Requiring the
    // library was a false negative on this product's own repository.
    const result = await jobs('node-worker-script');

    expect(result?.present).toBe(true);
    expect(result?.details?.processScripts).toBe(1);
  });

  it('recognises a queue library', async () => {
    const result = await jobs('express-jobs-no-ai');

    expect(result?.present).toBe(true);
    expect(result?.details?.nodeQueue).toBe(true);
  });
});
