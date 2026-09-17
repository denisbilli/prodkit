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

    // Written when inference was a cascade that refused to name anything it could not
    // prove. Scoring puts these four signals above the floor, so the profile is named
    // rather than hinted at — and at medium confidence, which is what decides whether
    // the expectations are actually applied. The assertion changed because the answer
    // improved, not to accommodate it.
    expect(inference.inferredProfile).toBe('game');
    expect(inference.reason).toMatch(/renderer|frame loop|asset pipeline/i);
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

    expect(ids).toContain('app.state-durability');
    expect(ids).toContain('app.asset-delivery');
    // The point of the profile: a game has no tenants to separate and no audit trail
    // anyone will read, so it is not marked down for missing them.
    expect(ids).not.toContain('tenancy.organization');
    expect(ids).not.toContain('audit.baseline');
  });

  it('calls out progress kept only in the browser', async () => {
    const analysis = await analyzeProject(fixture('phaser-game'));
    const saves = analysis.detectors['app.stateDurability'];

    expect(saves?.present).toBe(true);
    // Present but not complete: it saves, until it does not.
    expect(saves?.complete).toBe(false);
  });
});

describe('a browser application is not a static site', () => {
  it('refuses to judge an application that runs in the browser as a page', async () => {
    // The branch read "no backend" as "no application" and applied the profile that
    // expects almost nothing — so a factory simulator and a CAD application were both
    // told they were fine. This failure runs the other way from the rest: it demands
    // nothing, which is harder to notice and worse to act on.
    const { inferProductProfile } = await import('../src/expectations/inferProductProfile');
    const inference = inferProductProfile(await analyzeProject(fixture('browser-app')));

    // When this was written there was no profile for such an application, so the code
    // could only suggest one. `client-app` exists now, so it is judged rather than
    // merely described — which is the better answer, and the reason this assertion
    // changed rather than the behaviour being reverted to satisfy it.
    expect(inference.inferredProfile).not.toBe('static-site');
    expect(inference.inferredProfile).toBe('client-app');
  });

  it('still calls an actual brochure site a static site', async () => {
    // The other half: this must not become "no project is ever a static site".
    const { inferProductProfile } = await import('../src/expectations/inferProductProfile');
    const inference = inferProductProfile(await analyzeProject(fixture('brochure-site')));

    expect(inference.inferredProfile).toBe('static-site');
    // Medium, not high. One signal — a front end with no backend, database or sign-in —
    // is enough to name a brochure site and not enough to be sure of it. The old `high`
    // was a literal written into the branch; this is derived from the evidence.
    expect(inference.confidence).toBe('medium');
  });
});

describe('client-app', () => {
  it('judges a browser application as one instead of leaving it unjudged', async () => {
    const { inferProductProfile } = await import('../src/expectations/inferProductProfile');
    const inference = inferProductProfile(await analyzeProject(fixture('browser-app')));

    expect(inference.inferredProfile).toBe('client-app');
    expect(inference.confidence).toBe('medium');
  });

  it('asks a client application about crashes, and not about tenants', async () => {
    // On a server a crash is in the logs whether anyone planned for it or not. In code
    // running on someone else's device it is not: the screen goes white, the person
    // closes the tab, and nothing records that it happened.
    const report = buildReport(await analyzeProject(fixture('browser-app')), { profile: 'client-app' });
    const ids = (report.productProfile?.capabilities ?? []).map((c) => c.capabilityId);

    expect(ids).toContain('client.error-reporting');
    expect(ids).toContain('app.state-durability');
    expect(ids).not.toContain('tenancy.organization');
    expect(ids).not.toContain('audit.baseline');
  });

  it('prefers the game suggestion over the client-app one', async () => {
    // A game is a client application, so the specific answer must win. Under the
    // cascade this depended on which branch came first, and broke the moment client-app
    // was added above it. It is now declared — `game` refines `client-app` — so no
    // amount of reordering can break it again, and there is no ordering left to get
    // wrong.
    const { inferProductProfile } = await import('../src/expectations/inferProductProfile');
    const inference = inferProductProfile(await analyzeProject(fixture('three-multiplayer-game')));

    expect(inference.inferredProfile).toBe('game');
  });
});
