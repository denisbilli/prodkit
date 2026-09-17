import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

/**
 * Whether this project is a game.
 *
 * The distinction between conclusive and supporting evidence is the whole design here,
 * and it is deliberate. A game engine is conclusive: nothing depends on Phaser or ships
 * a `project.godot` for another reason. A renderer and a frame loop are not: a 3D
 * product configurator and a data visualisation are built from exactly the same two
 * things.
 *
 * Only conclusive evidence sets `present`, which decides the profile a repository is
 * judged against. Supporting evidence is reported because it is useful to a reader, and
 * decides nothing.
 *
 * This costs a real case. A multiplayer board game in this codebase's own test corpus
 * uses three.js, socket.io and a frame loop, with no engine anywhere — and it stays
 * unidentified. Widening the rule until it caught that one is exactly how the ai-saas
 * branch came to claim five unrelated repositories: a rule stretched to fit the sample
 * in front of you fits everything else too. `--profile game` remains available to say
 * so by hand.
 */

/** Engines and frameworks that exist to build games. */
const ENGINE_DEPS = [
  'phaser',
  'pixi.js',
  '@pixi/app',
  'babylonjs',
  '@babylonjs/core',
  'excalibur',
  'kaboom',
  'kaplay',
  'melonjs',
  'playcanvas',
  'ct.js',
  'gdevelop-js',
  'crafty',
  'impact',
];

const ENGINE_PY_DEPS = ['pygame', 'pygame-ce', 'arcade', 'panda3d', 'pyglet', 'ursina'];

/** Project files that only a game engine writes. */
const ENGINE_FILES: Array<[RegExp, string]> = [
  [/(^|\/)project\.godot$/, 'Godot'],
  [/\.uproject$/, 'Unreal'],
  [/(^|\/)ProjectSettings\/ProjectVersion\.txt$/, 'Unity'],
  [/(^|\/)conf\.lua$/, 'LÖVE'],
];

/** Present in games, and in plenty of things that are not games. */
const SUPPORTING_DEPS = [
  'three',
  '@react-three/fiber',
  'matter-js',
  'planck-js',
  'cannon-es',
  '@dimforge/rapier2d',
  'howler',
  '@pixi/sound',
  'colyseus',
  'colyseus.js',
];

async function detectEngine(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const engineDeps = [...hasAnyDep(ctx, ENGINE_DEPS), ...hasAnyPyDep(ctx, ENGINE_PY_DEPS)];
  for (const dep of engineDeps) evidence.push({ type: 'dependency', value: dep });

  const engineFiles: string[] = [];

  for (const [pattern, engine] of ENGINE_FILES) {
    const file = ctx.files.all.find((candidate) => pattern.test(candidate));
    if (!file) continue;

    engineFiles.push(file);
    evidence.push({ type: 'file', value: `${engine} project file`, file });
  }

  const supporting = hasAnyDep(ctx, SUPPORTING_DEPS);
  for (const dep of supporting) evidence.push({ type: 'dependency', value: dep });

  // A frame loop. Suggestive on its own — every animated interface has one — so it is
  // recorded and never counted.
  const loops = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/requestAnimationFrame\s*\(/, /\bgameLoop\b/i, /\bdeltaTime\b/i, /new\s+THREE\.Clock\s*\(/],
    10
  );
  for (const hit of loops) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  // Realtime transport. On its own it is a chat application; alongside a renderer and
  // a frame loop it is a multiplayer game.
  const realtime = hasAnyDep(ctx, ['socket.io', 'socket.io-client', 'ws', 'colyseus', 'colyseus.js', 'peerjs', 'geckos.io']);
  for (const dep of realtime) evidence.push({ type: 'dependency', value: dep });

  /**
   * An asset pipeline. The most telling of the supporting signals, because the
   * vocabulary belongs to nothing else: a nine-slice is how a game draws a resizable
   * panel, an atlas is how it packs sprites. A configurator loads models; it does not
   * pack sprite sheets.
   */
  const assetScripts = Object.keys(ctx.packageJson?.scripts ?? {}).filter((name) =>
    /(sprite|atlas|tileset|9[-_]?slice|nine[-_]?slice|spritesheet)/i.test(name)
    || /^assets?[:_-]/i.test(name)
  );
  for (const name of assetScripts) {
    evidence.push({ type: 'note', value: `asset pipeline script "${name}"` });
  }

  const conclusive = engineDeps.length > 0 || engineFiles.length > 0;

  /**
   * How much a project looks like a game without proving it.
   *
   * Counted rather than decided. No single one of these is a game — a renderer is a
   * configurator, a frame loop is any animated interface, a realtime transport is a
   * chat — and that is exactly why one of them must never be enough. Together they are
   * a reasonable suspicion, and a suspicion is worth saying out loud as long as it is
   * not acted on silently.
   */
  const supportingSignals = [
    supporting.length > 0,
    loops.length > 0,
    realtime.length > 0,
    assetScripts.length > 0,
  ].filter(Boolean).length;

  return {
    key: 'game.engine',
    present: conclusive,
    evidence,
    details: {
      engines: engineDeps,
      engineFiles,
      supporting,
      frameLoop: loops.length > 0,
      realtime,
      assetScripts,
      supportingSignals,
    },
  };
}

/**
 * Where a player's progress lives.
 *
 * The failure this looks for is specific to games and brutal when it happens: progress
 * kept only in browser storage dies with a cleared cache, a private window or a new
 * device, and the player has no way to know it was never really saved. A durable store
 * behind the game is what makes a save a save.
 */
async function detectStatePersistence(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const clientOnly = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/localStorage\.setItem\s*\(/, /sessionStorage\.setItem\s*\(/, /indexedDB\.open\s*\(/],
    10
  );
  for (const hit of clientOnly) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  const saveRoutes = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/\bsave(?:Game|State|Progress|Slot)\b/i, /\bload(?:Game|State|Progress|Slot)\b/i, /\bcheckpoint\b/i],
    10
  );
  for (const hit of saveRoutes) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  // A database is the durable half. Read from the stack rather than re-detected, so
  // this agrees with what the report says the data layer is.
  const durable = ctx.files.all.some((file) => /(^|\/)(schema\.prisma|.*\.sql)$/i.test(file))
    || Boolean(ctx.packageJson?.dependencies?.pg)
    || Boolean(ctx.packageJson?.dependencies?.mongoose)
    || Boolean(ctx.packageJson?.dependencies?.['better-sqlite3']);

  if (durable) evidence.push({ type: 'note', value: 'a durable store is present' });

  const saves = clientOnly.length > 0 || saveRoutes.length > 0;

  return {
    key: 'app.stateDurability',
    present: saves || durable,
    // Client storage alone is the partial case: it saves, until it does not.
    complete: durable,
    evidence,
    details: { durable, clientStorage: clientOnly.length > 0, saveRoutines: saveRoutes.length },
  };
}

/**
 * How the assets reach the player.
 *
 * In a game the assets are the product — sprites, audio, models — and they are most of
 * what is downloaded. Served without caching they are re-fetched on every visit, which
 * is the difference between a game that starts and a game that is abandoned while it
 * loads.
 */
async function detectAssetDelivery(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      /express\.static\s*\([^)]*maxAge/,
      /Cache-Control["']?\s*[:,]\s*["'][^"']*max-age/i,
      /setHeaders\s*:/,
      /assetPrefix\s*:/,
      /immutable/,
    ],
    10
  );
  for (const hit of hits) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  // Declared outside the code: a CDN or an edge host with its own header rules.
  const headerFiles = ctx.files.all.filter((file) =>
    /(^|\/)(_headers|netlify\.toml|vercel\.json|cloudfront.*\.ya?ml)$/i.test(file)
  );
  for (const file of headerFiles) evidence.push({ type: 'file', value: file, file });

  return {
    key: 'app.assetDelivery',
    present: hits.length > 0 || headerFiles.length > 0,
    evidence,
    details: { inCode: hits.length, headerFiles: headerFiles.length },
  };
}

export async function detectGame(ctx: DetectContext): Promise<DetectorResult[]> {
  return Promise.all([detectEngine(ctx), detectStatePersistence(ctx), detectAssetDelivery(ctx)]);
}
