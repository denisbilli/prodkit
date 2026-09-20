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

/**
 * The last two numbers, and the same mistake in both.
 *
 * A Python transcription script whose verdict reads "ProdKit could not judge this
 * project" was told "Nothing outstanding to estimate" and "ProdKit found no actionable
 * remediation tasks". Both read as "there is nothing to do". There is nothing to do
 * because nothing could be looked at, which is the opposite advice.
 */
describe('an unreadable repository is not a finished one', () => {
  it('does not estimate the work where it could not read the project', async () => {
    // A profile asked for by name, so the estimate is not short-circuited by the
    // "no profile applied" branch: this is the case where the estimator has a profile,
    // finds nothing open, and would otherwise report that there is nothing to do.
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'phoenix-app')), {
      profile: 'b2b-saas',
    });

    expect(report.inconclusive).toBe(true);
    expect(report.executiveSummary.estimatedEffort).toMatch(/could be read/i);
    expect(report.executiveSummary.estimatedEffort).not.toMatch(/nothing outstanding/i);
  });

  it('does not report a finished estimate on any unreadable fixture', async () => {
    const offenders: string[] = [];

    for (const name of fs.readdirSync(FIXTURES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
      let report;
      try {
        report = buildReport(await analyzeProject(path.join(FIXTURES, name)), { profile: 'auto' });
      } catch {
        continue;
      }
      if (!report.inconclusive) continue;
      if (/nothing outstanding/i.test(report.executiveSummary.estimatedEffort)) offenders.push(name);
    }

    expect(offenders).toEqual([]);
  });

  it('does not present an empty plan as a finished one', async () => {
    const { buildPlan } = await import('../src/planner/buildPlan');
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'transcription-script')), {
      profile: 'auto',
    });
    const plan = buildPlan(report);

    expect(report.inconclusive).toBe(true);
    expect(plan.tasks).toHaveLength(0);
    expect(plan.summary).toMatch(/could be read/i);
    expect(plan.summary).not.toMatch(/no actionable remediation tasks/i);
  });

  it('still says an empty plan is empty where the project was read', async () => {
    const { buildPlan } = await import('../src/planner/buildPlan');
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'express-secure')), {
      profile: 'internal-tool',
    });
    const plan = buildPlan(report);

    expect(report.inconclusive).toBe(false);
    expect(plan.summary).not.toMatch(/could be read/i);
  });
})
