import type { StackInfo } from '../analyzer/types';
import { DOCS_DIRECTORIES } from '../analyzer/detectPackaging';

/**
 * Where a backend lives, when it does not live in the product.
 *
 * marktext is an Electron editor and its report said "Detected backend: next". The
 * Next application is `packages/website`, its marketing site. yaak is a Tauri client
 * and said `hono`, which is a plugin in `plugins-external/`.
 *
 * Dropping those from the stack was tried and refused: a test holds the decision that
 * the servers are really there and are merely not the product's, and that decision has
 * its reasoning written down. What misleads is not the list — it is the sentence, which
 * names a framework and says nothing about whose it is.
 *
 * So the sentence says. Only when *every* workspace with a backend is a documentation,
 * playground or example directory: a repository with a real server beside its docs site
 * has a backend of its own, and gets no annotation.
 */
export function backendOrigin(stack: StackInfo): string | undefined {
  if (stack.backend.length === 0) return undefined;

  const withBackend = stack.workspaces.filter((workspace) => workspace.backend.length > 0);
  if (withBackend.length === 0) return undefined;
  if (withBackend.some((workspace) => !DOCS_DIRECTORIES.test(`${workspace.root}/`))) return undefined;

  const roots = [...new Set(withBackend.map((workspace) => workspace.root))];

  return `in ${roots.join(', ')} — documentation or examples, not the product itself`;
}
