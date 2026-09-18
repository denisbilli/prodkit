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

/**
 * Evidence has to be about the claim it sits under.
 *
 * "No upload handling was found in this repository" arrived with six snippets beneath it
 * — five Django auth decorators and a PDF content type — and a stamp of "confidence:
 * high, evidence quality: strong" earned from them. That a project has authentication is
 * why an upload check would matter; it is not evidence about uploads, which is the
 * sentence the rate-limiting rule already carries for the same mistake.
 */
describe('an absence is evidenced by what was looked for', () => {
  it('does not cite authentication lines under a claim about uploads', async () => {
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'auto' });
    const uploads = report.findings.find((f) => f.id === 'uploads.public-exposure');

    expect(uploads?.status).toBe('unknown');
    expect(uploads?.evidence.every((item) => item.type !== 'snippet')).toBe(true);
    expect(uploads?.evidence.some((item) => /searched for upload handling/.test(String(item.value)))).toBe(true);
  });

  it('cites the route rather than everything the detector touched', async () => {
    /**
     * The detector looks for four different things at once — upload routes, whether they
     * are guarded, MIME validation, antivirus — and put all of it in one list. A claim
     * about whether uploads are exposed is shown the routes, and the rest belongs to the
     * questions it is about.
     */
    const report = buildReport(await analyzeProject(fixture('uploads-with-validation')), {
      profile: 'auto',
    });
    const uploads = report.findings.find((f) => f.id === 'uploads.public-exposure');

    expect(uploads?.evidence.length).toBeGreaterThan(0);
    expect(uploads?.evidence.some((item) => /content-type|mimetype/i.test(String(item.value)))).toBe(false);
  });

  it('still cites the route when there is one to cite', async () => {
    // The rule is about absence. Where uploads exist, the lines that show them are
    // exactly what the reader needs.
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'auto' });
    const uploads = report.findings.find((f) => f.id === 'uploads.public-exposure');

    expect(uploads?.status).not.toBe('unknown');
    expect(uploads?.evidence.some((item) => item.type === 'snippet')).toBe(true);
  });
});

/**
 * A warning printed beside a verdict that ignores it is not a warning.
 *
 * Plausible is a Phoenix application: 1257 Elixir files with 215 of JavaScript around
 * them. The analyzer said exactly that — "1257 Elixir files were not analysed: this
 * reading covers only part of the repository" — and in the same report called it a
 * client application, with high confidence, scored 85 and not inconclusive. Found by
 * cloning public repositories; not one of the seventy-eight on the machine this was
 * written on crosses the line.
 */
describe('a reading that covers a minority of the repository', () => {
  it('does not characterise a project whose language it cannot read', async () => {
    const report = buildReport(await analyzeProject(fixture('phoenix-app')), { profile: 'auto' });

    expect(report.inconclusive).toBe(true);
    expect(report.overallScore).toBeLessThanOrEqual(39);
  });

  it('says which language, rather than telling the author to check their path', async () => {
    // "Check that the path points at application source" is right for an empty directory
    // and wrong here: the path was fine, and it sends somebody looking for a mistake they
    // did not make.
    const report = buildReport(await analyzeProject(fixture('phoenix-app')), { profile: 'auto' });

    expect(report.inconclusiveReasons.join(' ')).toMatch(/written in Elixir/);
    expect(report.executiveSummary.verdict).toMatch(/Elixir/);
  });

  it('leaves a project with a few files in another language alone', async () => {
    /**
     * The shape this must not break. A game with some C++ beside its TypeScript, a
     * Flutter application with a Lua script: the unread part is a minority and the
     * reading stands.
     */
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'auto' });

    expect(report.inconclusiveReasons.join(' ')).not.toMatch(/does not read/);
  });
});

/**
 * A word, and three letters inside another word, are not the same thing.
 *
 * Ruff — a Python linter written in Rust — was read as a B2B SaaS. Two of the three
 * signals behind that were substring collisions: `/otp/i` matched
 * `VarError::NotPresent` and `PandasUseOfDotPivotOrUnstack`, and `memberId` matched
 * `ScopedMemberId`, a symbol table in a compiler.
 */
describe('a keyword that happens to sit inside another word', () => {
  it('does not credit two-factor authentication to a compiler', async () => {
    const analysis = await analyzeProject(fixture('rust-compiler'));

    expect(analysis.detectors['auth.2fa']?.present).toBe(false);
  });

  it('does not read a symbol table as a tenant membership', async () => {
    // "Member" means a struct field in most languages and a person in a few; only a
    // tenant word says which, which is this detector's own rule about weak words.
    const analysis = await analyzeProject(fixture('rust-compiler'));

    expect(analysis.detectors['tenancy.membership']?.present).toBe(false);
  });

  it('still finds a one-time code where somebody wrote one', async () => {
    // The fix must not blind the check: these are how people actually write it.
    const analysis = await analyzeProject(fixture('express-two-factor'));

    expect(analysis.detectors['auth.2fa']?.present).toBe(true);
  });
});
