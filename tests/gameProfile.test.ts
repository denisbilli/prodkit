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

  it('suggests a game from signals that do not prove one', async () => {
    // A renderer, a frame loop, realtime multiplayer and an asset pipeline. None of
    // them is a game on its own; together they are worth saying out loud. The
    // suggestion changes no number — it names the profile and how to apply it.
    const { inferProductProfile } = await import('../src/expectations/inferProductProfile');
    const analysis = await analyzeProject(fixture('three-multiplayer-game'));
    const inference = inferProductProfile(analysis);

    expect(inference.inferredProfile).toBeNull();
    expect(inference.suggestion?.profile).toBe('game');
    expect(inference.suggestion?.reason).toMatch(/--profile game/);
  });

  it('does not suggest a game for a renderer and a frame loop alone', async () => {
    // A product configurator is built from exactly those two, which is why two is not
    // enough. Measured across eleven real repositories: the only one reaching three is
    // a multiplayer board game, and a CAD application sits at two.
    const { inferProductProfile } = await import('../src/expectations/inferProductProfile');
    const analysis = await analyzeProject(fixture('three-viewer'));

    expect(inferProductProfile(analysis).suggestion).toBeUndefined();
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
