import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const finding = (report: { findings: Array<{ id: string; status: string }> }, id: string) =>
  report.findings.find((f) => f.id === id);

/**
 * Two capabilities the game profile requires, asked of games that ship as a binary.
 *
 * Found by walking the half of the report that had never been walked: under `auto`,
 * every one of the five game fixtures — Unity and LÖVE alongside the three web ones —
 * was told at `high` that it has no asset-delivery policy. `Cache-Control`, `_headers`
 * and `vercel.json` are how a browser is told to keep the assets, and for a game the
 * player downloaded once there is no browser to tell.
 *
 * The same walk showed neither capability had ever been satisfied by any fixture, so
 * both now have one that does — a measure that cannot vary is not a measure.
 */
describe('a game that is not in a browser', () => {
  it('is not asked how it caches assets a player already downloaded', async () => {
    const report = buildReport(await analyzeProject(fixture('unity-game')), { profile: 'auto' });

    expect(finding(report, 'expectation.app.asset-delivery.required')).toBeUndefined();
  });

  it('is still asked when the game runs in a browser', async () => {
    const report = buildReport(await analyzeProject(fixture('phaser-game')), { profile: 'auto' });

    expect(finding(report, 'expectation.app.asset-delivery.required')?.status).toBe('missing');
  });

  /**
   * The positive case the corpus lacked. `_headers` is Netlify's and Cloudflare's way
   * of saying how long the browser may keep a file, and the capability exists to find
   * exactly that.
   */
  it('is satisfied by a game that says how long its assets may be kept', async () => {
    const report = buildReport(await analyzeProject(fixture('browser-game-cached-assets')), { profile: 'auto' });

    expect(finding(report, 'expectation.app.asset-delivery.required')).toBeUndefined();
  });

  /**
   * `PlayerPrefs` is Unity's, `love.filesystem` is LÖVE's, `FileAccess` is Godot's.
   * Each is the name its engine defines, so a call to one is the capability itself
   * rather than a word that tends to accompany it — and durability had never come back
   * satisfied for any game either.
   */
  it('reads a save written through the engine own API', async () => {
    const analysis = await analyzeProject(fixture('unity-game-with-saves'));

    expect(analysis.detectors['app.stateDurability']?.present).toBe(true);
    expect(analysis.detectors['app.stateDurability']?.complete).toBe(true);
  });

  it('still reports a game that writes nothing down', async () => {
    const analysis = await analyzeProject(fixture('unity-game'));

    expect(analysis.detectors['app.stateDurability']?.complete).toBe(false);
  });
});
