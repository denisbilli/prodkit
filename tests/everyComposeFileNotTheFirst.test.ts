import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Every compose file, not the first one in the list.
 *
 * A repository has several: `docker-compose.yml` beside `.devcontainer/
 * docker-compose.yml`, an override for tests, one per deployment shape. Two detectors
 * read whichever came back first and ignored the rest, so a Postgres declared only in
 * the production compose was invisible whenever a development one sorted ahead of it
 * — and which one that is was the filesystem's business until this session sorted the
 * scan.
 *
 * Found by going looking for the shape rather than by a repository: atuin showed a
 * first-match file lookup answering the wrong question in `deployment.readiness`, and
 * these two were the other places doing it. immich has seven compose files and reads
 * the same two stores either way, so nothing in tonight's set demonstrates the loss;
 * this fixture does, and the first-match reading fails it.
 *
 * The devcontainer is not excluded here, which is the difference from
 * `docker.presence`. "How does this ship" is answered by the image the product is
 * built into; "what does it store data in" is answered by the database it talks to,
 * and in development that is the one the devcontainer starts. The same file, two
 * questions, two answers.
 */
describe('every compose file, not the first', () => {
  it('finds a store declared in a compose file that is not the first', async () => {
    const analysis = await analyzeProject(fixture('two-compose-files'));

    expect(analysis.stack.databases).toEqual(expect.arrayContaining(['redis', 'postgres']));
  });

  it('finds a worker service in a compose file that is not the first', async () => {
    const analysis = await analyzeProject(fixture('two-compose-files'));

    expect(analysis.detectors['jobs.background']?.details?.composeWorker).toBe(true);
  });

  /**
   * And cites each store once. immich runs Postgres and Redis in all seven of its
   * compose files, so reading every one turned two facts into eleven citations of the
   * same two facts. A reader is promised a line they can open and argue with; eleven
   * lines saying the same thing is not eleven times the argument.
   */
  it('cites a store once, from the first file that shows it', async () => {
    const analysis = await analyzeProject(fixture('two-compose-files'));
    const cited = (analysis.detectors['stack.database']?.evidence ?? [])
      .filter((e) => String(e.value).includes('in docker-compose'))
      .map((e) => e.value);

    expect(cited).toHaveLength(new Set(cited).size);
  });
});
