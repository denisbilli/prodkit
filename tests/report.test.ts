import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { computeMaturity, computeScore } from '../src/report/score';

describe('score', () => {
  it('applies deterministic penalties and clamp', () => {
    const score = computeScore([
      { id: 'a', title: 'a', category: 'security', severity: 'critical', status: 'missing', description: '', evidence: [], recommendation: '', confidence: 'low', evidenceQuality: 'weak' },
      { id: 'b', title: 'b', category: 'security', severity: 'high', status: 'missing', description: '', evidence: [], recommendation: '', confidence: 'low', evidenceQuality: 'weak' },
      { id: 'c', title: 'c', category: 'security', severity: 'medium', status: 'partial', description: '', evidence: [], recommendation: '', confidence: 'low', evidenceQuality: 'weak' },
      { id: 'd', title: 'd', category: 'security', severity: 'low', status: 'missing', description: '', evidence: [], recommendation: '', confidence: 'low', evidenceQuality: 'weak' },
      { id: 'e', title: 'e', category: 'security', severity: 'info', status: 'missing', description: '', evidence: [], recommendation: '', confidence: 'low', evidenceQuality: 'weak' },
    ]);
    expect(score).toBe(68);
  });

  it('maps maturity bands', () => {
    expect(computeMaturity(20)).toBe('prototype');
    expect(computeMaturity(50)).toBe('early');
    expect(computeMaturity(70)).toBe('partial');
    expect(computeMaturity(90)).toBe('production_ready');
  });
});

describe('inconclusive assessment', () => {
  it('gives an unrecognizable project no score at all', async () => {
    const analysis = await analyzeProject(path.resolve(__dirname, 'fixtures', 'unknown-project'));
    const report = buildReport(analysis);

    expect(report.inconclusive).toBe(true);
    expect(report.inconclusiveReasons.length).toBeGreaterThan(0);
    // This asserted a cap at 39 and the band `prototype`. The cap was there so that
    // the absence of findings could not be rewarded, and it went on to be the answer
    // for eleven repositories in the corpus at once — one of them with no findings at
    // all. A repository this analyzer could not read is not a bad product; it is one
    // it has nothing to say about, and the reasons say so in the number's place.
    expect(report.overallScore).toBeNull();
    expect(report.maturityLevel).toBe('inconclusive');
  });

  it('does not mark a recognized project as inconclusive', async () => {
    const analysis = await analyzeProject(path.resolve(__dirname, 'fixtures', 'express-basic'));
    const report = buildReport(analysis);

    expect(report.inconclusive).toBe(false);
    expect(report.inconclusiveReasons).toEqual([]);
  });
});

/**
 * A number nobody measured.
 *
 * Eleven repositories in the verification corpus scored exactly 39 — a wake-word
 * engine, a database manager, an Advent of Code repository, a photo tool. It was not
 * a coincidence and it was not a measurement: 39 was the cap applied to an
 * inconclusive reading, and every inconclusive reading reached it. One of the eleven
 * had no findings at all, so the report said "39 of 100, prototype" about a project
 * it had found nothing whatsoever to say.
 */
describe('an inconclusive reading has no score', () => {
  it('does not hand the same number to every project it could not read', async () => {
    const paths = ['unknown-project', 'phoenix-app', 'empty-project'];
    const scores: Array<number | null> = [];

    for (const name of paths) {
      try {
        const report = buildReport(await analyzeProject(path.resolve(__dirname, 'fixtures', name)), {
          profile: 'auto',
        });
        if (report.inconclusive) scores.push(report.overallScore);
      } catch {
        continue;
      }
    }

    expect(scores.length).toBeGreaterThan(0);
    expect(scores.every((score) => score === null)).toBe(true);
  });

  it('still scores a project it could read', async () => {
    // The rule must not swallow the ordinary case: a recognised project keeps a number.
    const report = buildReport(await analyzeProject(path.resolve(__dirname, 'fixtures', 'express-basic')), {
      profile: 'auto',
    });

    expect(report.inconclusive).toBe(false);
    expect(typeof report.overallScore).toBe('number');
  });

  it('refuses a score gate rather than passing one it cannot answer', async () => {
    // `--fail-under 50` on a report with no score must not pass: passing would say the
    // project cleared a bar nobody measured it against.
    const report = buildReport(await analyzeProject(path.resolve(__dirname, 'fixtures', 'unknown-project')), {
      profile: 'auto',
    });

    expect(report.overallScore).toBeNull();
    expect(report.executiveSummary.scoreExplanation).toMatch(/not scored/i);
  });
});
