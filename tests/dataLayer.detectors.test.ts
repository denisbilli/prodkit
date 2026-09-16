import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('managed data platforms and ORMs', () => {
  it('reads Supabase as a Postgres data layer, not as no data layer at all', async () => {
    // The regression: a repository whose entire data layer is a hosted service has no
    // database driver, so a detector that only reads drivers reported "unknown" — the
    // first line of the report telling the reader the tool had not understood their
    // project. Supabase is the default in the AI builders this product targets.
    const analysis = await analyzeProject(fixture('nextjs-supabase'));

    expect(analysis.stack.databases).toContain('postgres');
    expect(analysis.stack.dataPlatforms).toContain('supabase');
    expect(analysis.detectors['stack.database']?.present).toBe(true);
  });

  it('takes the engine from the Prisma schema, the only place that names it', async () => {
    const analysis = await analyzeProject(fixture('prisma-postgres'));

    expect(analysis.stack.orms).toContain('prisma');
    expect(analysis.stack.databases).toContain('postgres');
  });

  it('claims no platform or ORM for a project that uses neither', async () => {
    const analysis = await analyzeProject(fixture('express-basic'));

    expect(analysis.stack.dataPlatforms).toEqual([]);
    expect(analysis.stack.orms).toEqual([]);
  });
});
