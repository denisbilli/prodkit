import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Every finding is supposed to point at a line somebody can open and argue with.
 *
 * Two repositories in the verification corpus were being cited a bundled
 * `index-BVY8w6Ig.js`: one line of forty thousand characters, of which the report showed
 * the first two hundred. It names no function the author wrote and nothing they can
 * change, and in one case it was the only evidence behind a claim about their code.
 */
describe('a citation somebody can check', () => {
  it('does not quote a line nobody can read', async () => {
    const analysis = await analyzeProject(fixture('bundled-asset'));

    const cited = Object.values(analysis.detectors).flatMap((detector) => detector?.evidence ?? []);

    // The bundle contains `requireRole("admin")`. Finding it there would be finding it in
    // generated output, which is not what anybody edits — and quoting it would show two
    // hundred characters out of eleven thousand on one line.
    expect(cited.some((evidence) => evidence.file?.includes('index-BVY8w6Ig'))).toBe(false);
    // `snippet` only: absence evidence names what was looked for, which is the report
    // saying it searched rather than that it found.
    expect(
      cited.some((evidence) => evidence.type === 'snippet' && String(evidence.value).includes('requireRole')),
    ).toBe(false);
    expect(analysis.detectors['authz.roles']?.present).toBe(false);
  });

  it('still reads the source beside it', async () => {
    // The rule skips a line, not a file, and certainly not a project: everything the
    // author actually wrote is still analysed.
    const analysis = await analyzeProject(fixture('bundled-asset'));

    expect(analysis.files.source).toContain('server.js');
    expect(analysis.stack.backend).toContain('express');
  });
});

/**
 * In a product that talks to a model, `role` usually means who is speaking.
 */
describe('a chat transcript is not an authorization model', () => {
  it('does not credit a role model to a repository that only renders chat roles', async () => {
    // Two shapes, both chat: a role compared in markup to pick a label, and a plain
    // `if (role === 'assistant')` that is not markup at all.
    const analysis = await analyzeProject(fixture('chat-roles-only'));

    expect(analysis.detectors['authz.roles']?.present).toBe(false);
  });

  it('still sees a role model where one is enforced', async () => {
    // The same chat interface, with a guard beside it. Dropping the displayed roles must
    // not blind the detector to the checked ones.
    const analysis = await analyzeProject(fixture('roles-and-chat'));

    expect(analysis.detectors['authz.roles']?.present).toBe(true);

    const cited = (analysis.detectors['authz.roles']?.evidence ?? []).map((e) => String(e.value));
    expect(cited.some((line) => line.includes('requireRole'))).toBe(true);
    expect(cited.some((line) => line.includes("m.role === 'user'"))).toBe(false);
    expect(cited.some((line) => line.includes("role === 'assistant'"))).toBe(false);
  });
});
