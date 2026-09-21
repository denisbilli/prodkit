import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const readme = fs.readFileSync(path.resolve(__dirname, '..', 'README.md'), 'utf8');
const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The README is a promise, and it had stopped being true.
 *
 * It said "Overall score (0-100)" after the score had learnt to be `null` — the whole
 * point of which is that a reading covering a minority of a repository does not get to
 * produce a number. It listed four maturity levels after `inconclusive` became the
 * fifth. It said "Billing/Stripe signals" after processors in six other ecosystems
 * were read. And it said nothing about the two things the report now says about its
 * own reading.
 *
 * The supported-stacks section has been generated from the catalogue and checked by a
 * test for a while, which is why it never drifted. These are the claims that had
 * nobody watching them.
 */
describe('the README promises what the product does', () => {
  /**
   * The list line itself, not the word anywhere in the file. The first version of
   * this test looked for each level anywhere in the README, and removing
   * `inconclusive` from the list passed it — because a paragraph further down also
   * used the word. That paragraph turned out to be stale in its own right: it still
   * promised the score was "capped at 39", which was the behaviour before a missing
   * answer stopped being written as a number.
   */
  it('lists every maturity level the report can produce', async () => {
    const line = readme.split('\n').find((l) => l.startsWith('- Maturity level'));

    expect(line, 'the README has no maturity level line').toBeDefined();
    for (const level of ['inconclusive', 'prototype', 'early', 'partial', 'production_ready']) {
      expect(line, `the maturity list omits "${level}"`).toContain(level);
    }
  });

  it('does not still promise the capped score that inconclusive replaced', () => {
    expect(readme).not.toMatch(/capped at 39/);
  });

  /**
   * Checked against a report rather than against the type, because the promise is
   * about what a reader receives.
   */
  it('does not promise a score where the analyzer returns none', async () => {
    const inconclusive = buildReport(await analyzeProject(fixture('dotnet-library')), { profile: 'auto' });

    expect(inconclusive.overallScore).toBeNull();
    expect(readme).not.toContain('- Overall score (0-100)\n');
    expect(readme).toMatch(/`null` where too little of the repository could be read/);
  });

  it('says that reading depth is reported, because the report reports it', async () => {
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'auto' });

    expect(report.diagnostics.readingDepth.length).toBeGreaterThan(0);
    expect(readme).toMatch(/How deeply each language was read/);
  });

  it('says that an unaskable question comes back unknown, because it does', async () => {
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'auto' });
    const unknowns = report.findings.filter((f) => f.status === 'unknown');

    expect(unknowns.length).toBeGreaterThan(0);
    expect(readme).toMatch(/comes back `unknown`, never `passed` and never `missing`/);
  });
});
