import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A quarter of the verification corpus received no profile at all, and much of it was
 * packages: Meta's llama3 reference implementation, a Markdown converter, a photo
 * editor, this project's own AI package and this project itself. Every profile assumed
 * a running service with users, so the most common kind of code on a developer's disk
 * had no category.
 */
describe('a package other people install', () => {
  it('is recognised as a library', async () => {
    const analysis = await analyzeProject(fixture('npm-library'));

    expect(inferProductProfile(analysis).inferredProfile).toBe('library');
  });

  it('is not asked for things nobody does to a package', async () => {
    // "Missing authentication" on a library wastes the reader's time and makes them
    // trust the rest of the report less.
    const report = buildReport(await analyzeProject(fixture('npm-library')), { profile: 'library' });
    const byId = new Map(report.productProfile!.capabilities.map((c) => [c.capabilityId, c]));

    for (const id of ['auth.baseline', 'tenancy.isolation', 'gdpr.export', 'security.cors', 'observability.health']) {
      expect(byId.get(id)?.status, `${id} was asked of a package`).toBe('not_applicable');
    }
    expect(report.criticalIssues).toHaveLength(0);
  });

  it('is judged on whether it can be depended on', async () => {
    const report = buildReport(await analyzeProject(fixture('npm-library')), { profile: 'library' });
    const byId = new Map(report.productProfile!.capabilities.map((c) => [c.capabilityId, c]));

    for (const id of ['packaging.metadata', 'packaging.entrypoints', 'packaging.license', 'docs.readme', 'quality.tests']) {
      expect(byId.get(id)?.status, `${id} was not verified`).toBe('present');
    }

    // A satisfied expectation never becomes a finding, so a report that verified five
    // required capabilities used to say nothing had been verified at all.
    expect(report.diagnostics.verifiedChecks).toBeGreaterThanOrEqual(5);
  });

  it('is not confused with an application that happens to have a manifest', async () => {
    // A Next.js application's manifest is just as complete. What it does not declare is
    // an entry point, because nobody imports a website.
    const analysis = await analyzeProject(fixture('nextjs-app'));

    expect(analysis.detectors['packaging.entrypoints']?.present).toBe(false);
    expect(inferProductProfile(analysis).inferredProfile).not.toBe('library');
  });

  it('is still a library when its subject matter is payments', async () => {
    // A tool that searches for `STRIPE_WEBHOOK_SECRET` contains the string it searches
    // for. This analyzer did exactly this to itself: it read its own detector tables as
    // a payment integration and reported itself as a B2B SaaS at 97/100.
    const analysis = await analyzeProject(fixture('pattern-scanner'));

    expect(inferProductProfile(analysis).inferredProfile).toBe('library');
  });

  it('is not claimed by a script with nothing declared about it', async () => {
    // A loose file is not a package. Without a manifest there is nothing to install.
    const analysis = await analyzeProject(fixture('script-no-manifest'));

    expect(inferProductProfile(analysis).inferredProfile).not.toBe('library');
  });
});

describe('software as a service has to be reachable', () => {
  it('does not call a command-line package a SaaS', async () => {
    const analysis = await analyzeProject(fixture('pattern-scanner'));

    expect(inferProductProfile(analysis).inferredProfile).not.toBe('b2b-saas');
  });

  it('still recognises a real one', async () => {
    const analysis = await analyzeProject(fixture('nextjs-stripe-webhook-hardened'));
    const inferred = inferProductProfile(analysis).inferredProfile;

    expect(['b2b-saas', 'ai-saas', 'marketplace', 'b2c-app']).toContain(inferred);
  });
});

describe('what makes a package fit to publish', () => {
  it('separates a licence file from a declared licence', async () => {
    const analysis = await analyzeProject(fixture('npm-library'));
    const license = analysis.detectors['packaging.license'];

    // Either alone is an answer a reader can act on; both is the complete one.
    expect(license?.present).toBe(true);
    expect(license?.complete).toBe(true);
  });

  it('separates tests from a way to run them', async () => {
    const analysis = await analyzeProject(fixture('npm-library'));

    expect(analysis.detectors['quality.tests']?.complete).toBe(true);
  });

  it('does not count a word for a test directory', async () => {
    // `src/latest.ts` and `contest.py` both contain "test", and a repository does not
    // get credit for a word.
    const analysis = await analyzeProject(fixture('pattern-scanner'));

    expect(analysis.detectors['quality.tests']?.present).toBe(false);
  });

  it('does not accept a README that is only a title', async () => {
    const analysis = await analyzeProject(fixture('vanilla-static'));

    expect(analysis.detectors['docs.readme']?.complete).toBe(false);
  });
});
