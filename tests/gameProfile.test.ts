import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('game detection and profile', () => {
  it('is conclusive about an engine', async () => {
    const analysis = await analyzeProject(fixture('phaser-game'));

    expect(analysis.detectors['game.engine']?.present).toBe(true);
  });

  it('is not conclusive about a renderer and a frame loop', async () => {
    // A 3D product configurator and a data visualisation are built from exactly the
    // same two things. Widening this until it caught every game would catch them too —
    // which is how the ai-saas branch came to claim five unrelated repositories.
    const analysis = await analyzeProject(fixture('express-basic'));

    expect(analysis.detectors['game.engine']?.present).toBe(false);
  });

  it('holds a game to progress and assets, not to tenancy and audit', async () => {
    const report = buildReport(await analyzeProject(fixture('phaser-game')), { profile: 'game' });
    const ids = (report.productProfile?.capabilities ?? []).map((c) => c.capabilityId);

    expect(ids).toContain('game.state-persistence');
    expect(ids).toContain('game.asset-delivery');
    // The point of the profile: a game has no tenants to separate and no audit trail
    // anyone will read, so it is not marked down for missing them.
    expect(ids).not.toContain('tenancy.organization');
    expect(ids).not.toContain('audit.baseline');
  });

  it('calls out progress kept only in the browser', async () => {
    const analysis = await analyzeProject(fixture('phaser-game'));
    const saves = analysis.detectors['game.statePersistence'];

    expect(saves?.present).toBe(true);
    // Present but not complete: it saves, until it does not.
    expect(saves?.complete).toBe(false);
  });
});
