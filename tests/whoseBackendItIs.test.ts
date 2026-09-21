import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { renderMarkdown } from '../src/report/markdownReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const backendLine = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });

  return renderMarkdown(report).split('\n').find((line) => line.startsWith('- Backend:'));
};

/**
 * The sentence names a framework and used to say nothing about whose it is.
 *
 * marktext is an Electron editor and its report said "Detected backend: next", from
 * `packages/website` — the marketing site. yaak is a Tauri client and said `hono`,
 * which is a plugin.
 *
 * Dropping those from the stack was tried in 1.1.0 and refused by a test holding an
 * older decision: the servers are really there, and are merely not the product's. That
 * decision has its reasoning written down, so the repair belongs in the sentence
 * instead — which is what this is. The stack list is untouched and the corpus does not
 * move.
 */
describe('whose backend it is', () => {
  it('says so when every backend lives in docs or a playground', async () => {
    const line = await backendLine('monorepo-library');

    expect(line).toMatch(/packages\/docs/);
    expect(line).toMatch(/not the product itself/);
  });

  it('still lists the frameworks it found', async () => {
    const line = await backendLine('monorepo-library');

    expect(line).toMatch(/express/);
    expect(line).toMatch(/next/);
  });

  /**
   * The two directions it must not drift in: a repository with a real server beside
   * its docs site gets no annotation, and neither does one with a single workspace.
   */
  it('says nothing about a server that sits beside a docs site', async () => {
    const line = await backendLine('product-with-docs');

    expect(line).not.toMatch(/not the product itself/);
  });

  it('says nothing about a plain application', async () => {
    const line = await backendLine('express-basic');

    expect(line).toBe('- Backend: express');
  });

  /**
   * And nothing about a project with no Node workspaces at all.
   *
   * The workspace record is built from `package.json` and Python manifests, so a Rust
   * or Go service has a backend and no workspace carrying one. Without its guard the
   * annotation read "in  — documentation or examples, not the product itself", with
   * an empty list where the directories should be. No fixture reached that line until
   * a mutation run asked which one did.
   */
  it('says nothing about a service with no workspaces to speak of', async () => {
    expect(await backendLine('rust-hyper-service')).toBe('- Backend: hyper');
    expect(await backendLine('password-recovery-wording')).toBe('- Backend: go');
  });
});
