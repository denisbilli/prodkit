import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

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

/**
 * Deploying is something you do to a service.
 *
 * This product's own description promises that a game is not asked for a Dockerfile.
 * Thirty-nine of the seventy-eight repositories in the verification corpus were being
 * told they had "no meaningful deployment artifacts": libraries, browser games, a
 * Flutter app whose deployment story is a store release.
 */
describe('what deployment means depends on what is being deployed', () => {
  it('does not ask a package how it is deployed', async () => {
    const report = buildReport(await analyzeProject(fixture('dotnet-library')), { profile: 'auto' });
    const finding = report.findings.find((f) => f.id === 'deployment.readiness');

    expect(finding?.status).toBe('unknown');
    expect(finding?.description).toMatch(/decided outside it/);
  });

  it('does not ask a phone application either', async () => {
    const report = buildReport(await analyzeProject(fixture('android-app')), { profile: 'auto' });

    expect(report.findings.find((f) => f.id === 'deployment.readiness')?.status).toBe('unknown');
  });

  it('still asks a server that ships nothing to say how it runs', async () => {
    // The question is live wherever something is actually deployed from here.
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'auto' });

    expect(report.findings.find((f) => f.id === 'deployment.readiness')?.status).toBe('missing');
  });

  it('assesses anything carrying deployment artifacts, whatever it is', async () => {
    /**
     * A static page with a Dockerfile and a compose file beside it. Nothing here serves
     * requests, so the rule above would let it off — but somebody wrote those files for
     * a reason, and the question is live wherever they exist.
     */
    const report = buildReport(await analyzeProject(fixture('hosted-static')), { profile: 'auto' });

    expect(report.findings.find((f) => f.id === 'deployment.readiness')?.status).not.toBe('unknown');
  });
});
