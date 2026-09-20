import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { renderMarkdown } from '../src/report/markdownReport';

const FIXTURES = path.resolve(__dirname, 'fixtures');

/**
 * A number printed where nothing was measured.
 *
 * The overall score stopped being one of these in 0.45.0, and the same page went on
 * printing the rest: "Overall score: not scored" sat directly above "Observed score:
 * 100/100", and twelve categories read 100 of 100 on a repository the analyzer had
 * just said it could not read. The refusal and the praise were two lines apart.
 */
describe('a report that refuses to score does not score anything else either', () => {
  const inconclusiveFixtures = fs
    .readdirSync(FIXTURES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it('leaves the observed half unscored too', async () => {
    const offenders: string[] = [];

    for (const name of inconclusiveFixtures) {
      let report;
      try {
        report = buildReport(await analyzeProject(path.join(FIXTURES, name)), { profile: 'auto' });
      } catch {
        continue;
      }
      if (!report.inconclusive) continue;
      if (report.observedScore !== null || report.overallScore !== null) offenders.push(name);
    }

    expect(offenders).toEqual([]);
  });

  it('never scores a category nothing touched', async () => {
    const offenders: string[] = [];

    for (const name of inconclusiveFixtures) {
      let report;
      try {
        report = buildReport(await analyzeProject(path.join(FIXTURES, name)), { profile: 'auto' });
      } catch {
        continue;
      }
      for (const entry of report.categoryScores) {
        if (entry.notAssessed && entry.score !== null) offenders.push(`${name}: ${entry.category}`);
        if (!entry.notAssessed && entry.score === null) offenders.push(`${name}: ${entry.category} (assessed but unscored)`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('prints no bare number on the page of a report it could not read', async () => {
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'unknown-project')), {
      profile: 'auto',
    });
    const markdown = renderMarkdown(report);

    expect(report.inconclusive).toBe(true);
    expect(markdown).toContain('Overall score: not scored');
    expect(markdown).toContain('Observed score: not scored');
    // The caption said "the score is capped", which had not been true since the cap
    // was removed — the release that removed it left the sentence behind.
    expect(markdown).not.toContain('score is capped');
    expect(markdown).not.toMatch(/undefined\/100/);
  });

  it('still prints the numbers for a project it could read', async () => {
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'express-basic')), {
      profile: 'auto',
    });
    const markdown = renderMarkdown(report);

    expect(typeof report.observedScore).toBe('number');
    expect(markdown).toMatch(/Observed score: \d+\/100/);
  });
});

/**
 * The third place the refusal sat beside the praise.
 *
 * A Python transcription script whose verdict read "ProdKit could not judge this
 * project" listed three strengths underneath it, and the interface drew an amber
 * "Not launch ready" badge above them — a verdict about a product nobody had judged.
 */
describe('a report that refuses to judge hands out no verdicts either', () => {
  it('lists no strengths where it could not judge', async () => {
    const offenders: string[] = [];

    for (const name of fs.readdirSync(FIXTURES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
      let report;
      try {
        report = buildReport(await analyzeProject(path.join(FIXTURES, name)), { profile: 'auto' });
      } catch {
        continue;
      }
      if (!report.inconclusive) continue;
      if (report.executiveSummary.strengths.length > 0) offenders.push(`${name}: strengths`);
      if (report.executiveSummary.launchReady !== null) offenders.push(`${name}: launchReady`);
    }

    expect(offenders).toEqual([]);
  });

  it('still says yes or no where it could judge', async () => {
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'express-basic')), {
      profile: 'b2b-saas',
    });

    expect(report.inconclusive).toBe(false);
    expect(typeof report.executiveSummary.launchReady).toBe('boolean');
  });
})
