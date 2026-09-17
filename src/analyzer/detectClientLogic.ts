import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyDartDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

/**
 * Whether the front end is an application or a page.
 *
 * Profile inference reads "no backend, no database, no auth" as a static site, with
 * high confidence, and applies the profile that expects almost nothing. But a
 * client-side application has no backend by design — a calculator, an editor, a
 * simulator, a visualisation tool, a game — and that is a large part of what people
 * build with an AI assistant.
 *
 * Measured: of eleven real repositories, two were called static sites with high
 * confidence. One is a factory simulator with a simulation loop and a domain model;
 * the other is a CAD application with a 3D renderer and a state store. Both were being
 * told they were fine.
 *
 * This failure runs the other way from the ones around it: it does not demand too
 * much, it demands nothing, which is harder to notice and worse to act on.
 *
 * A static site is content. An application has logic and state. Counted, never decided
 * by one signal on its own, for the same reason as everywhere else in this file's
 * neighbours.
 */

const STATE_DEPS = [
  'redux',
  '@reduxjs/toolkit',
  'zustand',
  'jotai',
  'xstate',
  'mobx',
  'valtio',
  'recoil',
  'pinia',
  'vuex',
  'effector',
];

/** Directory names that hold logic rather than presentation. */
/**
 * Dart state and storage. Without these a Flutter application has a front end, no
 * backend and no database, which is the exact shape this file exists to stop being
 * called a static site — the same failure as a browser application, arriving from
 * mobile instead.
 */
const DART_STATE_DEPS = ['provider', 'riverpod', 'flutter_riverpod', 'bloc', 'flutter_bloc', 'get', 'mobx', 'redux'];
const DART_STORAGE_DEPS = ['shared_preferences', 'hive', 'isar', 'objectbox', 'sqflite', 'drift', 'flutter_secure_storage'];

const LOGIC_DIR = /(^|\/)(store|stores|state|engine|simulation|simulations|models|domain|reducers|machines)\//i;

export async function detectClientLogic(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const stateDeps = [...hasAnyDep(ctx, STATE_DEPS), ...hasAnyDartDep(ctx, DART_STATE_DEPS)];
  for (const dep of stateDeps) evidence.push({ type: 'dependency', value: dep });

  const logicDirs = [
    ...new Set(
      ctx.files.source
        .filter((file) => LOGIC_DIR.test(file))
        .map((file) => file.split('/').slice(0, -1).join('/'))
    ),
  ];
  for (const dir of logicDirs.slice(0, 5)) {
    evidence.push({ type: 'file', value: `logic lives in ${dir}` });
  }

  const dartStorage = hasAnyDartDep(ctx, DART_STORAGE_DEPS);
  for (const dep of dartStorage) evidence.push({ type: 'dependency', value: dep });

  const persistence = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/localStorage\.setItem\s*\(/, /indexedDB\.open\s*\(/, /\bnew\s+Worker\s*\(/],
    8
  );
  for (const hit of persistence) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  const drawing = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/getContext\s*\(\s*['"]2d['"]/, /getContext\s*\(\s*['"]webgl2?['"]/, /<canvas\b/i],
    8
  );
  for (const hit of drawing) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  /**
   * A render loop. The application is deciding what the screen shows, frame by frame.
   *
   * Counted here because canvas drawing on its own was one signal short of the two this
   * detector needs, so half a dozen browser games in the verification corpus came back
   * as `static-site` — a brochure page — when their whole product is a loop over a
   * canvas. A marketing page that animates on scroll uses the same call and has no
   * canvas, so it still reaches only one signal and is still a static site.
   */
  const frameLoop = await searchInFiles(
    ctx.root,
    ctx.files.source,
    /**
     * `setInterval` is deliberately absent. It was here for one revision and was wrong:
     * it matched a countdown in a React modal and a polling sync in an API client,
     * neither of which is the application deciding what the screen shows. Both projects
     * were real products that this demoted to plain client applications, and a demoted
     * profile is judged by fewer expectations — so the change quietly raised their
     * scores. `requestAnimationFrame` means a render loop and nothing else.
     */
    [/requestAnimationFrame\s*\(/],
    6
  );
  for (const hit of frameLoop) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  const signals = [
    stateDeps.length > 0,
    logicDirs.length > 0,
    persistence.length > 0 || dartStorage.length > 0,
    drawing.length > 0,
    frameLoop.length > 0,
  ].filter(Boolean).length;

  return {
    key: 'stack.clientLogic',
    // Two, for the same reason the game threshold is three: one signal is a cookie
    // banner writing to localStorage, or a marketing page with a hero canvas.
    present: signals >= 2,
    evidence,
    details: { stateDeps, logicDirs: logicDirs.length, persistence: persistence.length + dartStorage.length, drawing: drawing.length, frameLoop: frameLoop.length, signals },
  };
}
