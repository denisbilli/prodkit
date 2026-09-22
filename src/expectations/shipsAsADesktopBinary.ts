import type { ProjectAnalysis } from '../analyzer/types';

/**
 * The product is installed rather than served.
 *
 * Electron and Tauri are the two ways a web stack becomes a desktop binary, and neither
 * is a word anybody chose: a manifest naming one says how the thing reaches its user.
 *
 * A server-side datastore is what keeps a service that also ships a desktop client from
 * qualifying. `monorepo-with-frontend-and-backend-subfolders` has an `electron`
 * workspace beside an express backend on postgres and redis; the desktop client is one
 * of its faces, not the whole of it, and it has users to export and an origin to
 * protect.
 *
 * `stack.backend` cannot decide any of this. `usebruno/bruno` depends on express and
 * runs one in-process to proxy the requests its user composes, so "no backend" is false
 * of exactly the repository this exists for.
 */
export function shipsAsADesktopBinary(analysis: ProjectAnalysis): boolean {
  const packagedForTheDesktop = [analysis.stack, ...analysis.workspaceStacks].some(
    (stack) => stack.frontend.includes('electron') || stack.frontend.includes('tauri'),
  );

  return packagedForTheDesktop
    && analysis.stack.databases.length === 0
    && analysis.workspaceStacks.every((stack) => stack.databases.length === 0);
}
