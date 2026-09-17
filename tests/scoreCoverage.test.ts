import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { renderMarkdown } from '../src/report/markdownReport';
import { computeMaturity } from '../src/report/score';
import { inferProductProfile } from '../src/expectations/inferProductProfile';
import { scoreProfiles } from '../src/expectations/profileSignals';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The score starts at 100 and only ever subtracts, so it reads the same whether nothing
 * was found or nothing was looked at. In the verification corpus a two-file static page
 * was "production ready" at 90/100 on two passing checks out of nine, sitting next to an
 * application that reached 94 on twelve out of seventeen. The numbers looked comparable
 * and were not: one was evidence, the other was silence.
 */
describe('a score carries how much was verified', () => {
  it('does not call a repository production ready on almost no verified checks', () => {
    expect(computeMaturity(90, { passed: 2, assessed: 9 })).toBe('partial');
  });

  it('keeps the top band for a report that verified a real body of checks', () => {
    expect(computeMaturity(94, { passed: 12, assessed: 17 })).toBe('production_ready');
  });

  it('is not satisfied by a good proportion of almost nothing', () => {
    // Two out of three is 67% and is still almost nothing.
    expect(computeMaturity(95, { passed: 2, assessed: 3 })).toBe('partial');
  });

  it('leaves the lower bands to the score alone', () => {
    // Nothing about coverage can promote a repository, only stop it claiming the top.
    expect(computeMaturity(50, { passed: 40, assessed: 40 })).toBe('early');
    expect(computeMaturity(30, { passed: 40, assessed: 40 })).toBe('prototype');
  });

  it('says out loud that a high score came from silence', async () => {
    const report = buildReport(await analyzeProject(fixture('vanilla-static')), { profile: 'auto' });
    const markdown = renderMarkdown(report);

    expect(markdown).toMatch(/Verified: \d+ of \d+ checks that reached a verdict/);
    if (report.overallScore > 84) {
      expect(markdown).toMatch(/the score is high because little was found/);
      expect(report.maturityLevel).not.toBe('production_ready');
    }
  });
});

/**
 * Six browser games in the corpus came back as `static-site` — a brochure page — when
 * their whole product is a loop over a canvas.
 */
describe('a page that runs a render loop is not a brochure site', () => {
  it('counts the frame loop as logic the application holds itself', async () => {
    const analysis = await analyzeProject(fixture('vanilla-static'));

    expect(analysis.detectors['stack.clientLogic']?.present).toBe(true);
    expect(inferProductProfile(analysis).inferredProfile).not.toBe('static-site');
  });

  it('still calls a page with neither a canvas nor a loop a static site', async () => {
    // A marketing page that animates on scroll uses the same call and has no canvas, so
    // it reaches only one signal. Widening this until it caught every game would catch
    // every animated landing page too.
    const analysis = await analyzeProject(fixture('static-marketing'));

    expect(analysis.detectors['stack.clientLogic']?.present).toBe(false);
    expect(inferProductProfile(analysis).inferredProfile).toBe('static-site');
  });
});

/**
 * A render loop is real evidence that an application holds its own state, and adding it
 * to `client-app` let the general profile beat the specific ones. Three products in the
 * verification corpus were demoted — and a demoted profile is judged by fewer
 * expectations, so each one's score went up.
 */
describe('a general profile does not outrank the specific one', () => {
  const base = {
    backend: true, frontend: true, database: false, auth: false, billing: false,
    tenancy: false, adminSurface: false, marketplaceVocabulary: false, callsAModel: false,
    jobs: false, uploads: false, clientLogic: true, passwordReset: false,
    emailVerification: false, socialLogin: false, realtime: false, apiSurface: false,
    containerised: false, gameEngine: false, gameSignals: 0, mobilePlatforms: [] as string[],
    sourceFiles: 60,
  };

  it('reads a site that runs two model services as an AI product, not a browser app', () => {
    const [winner] = scoreProfiles({ ...base, callsAModel: true });

    expect(winner.profile).toBe('ai-saas');
  });

  it('still reads the same project without the model as a client application', () => {
    const [winner] = scoreProfiles(base);

    expect(winner.profile).toBe('client-app');
  });

  it('does not penalise a client that calls a model it does not host', () => {
    // The rule is about running a model server, not about touching an API. A desktop
    // client with no backend of its own is still a client.
    const [winner] = scoreProfiles({ ...base, backend: false, callsAModel: true });

    expect(winner.profile).toBe('client-app');
  });
});
