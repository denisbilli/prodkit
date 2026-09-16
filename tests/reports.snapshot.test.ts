import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { renderMarkdown } from '../src/report/markdownReport';

interface ReportSnapshot {
  score: number;
  maturity: string;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  findings: Array<{
    id: string;
    severity: string;
    status: string;
  }>;
}

function extractMetric(markdown: string, regex: RegExp, fallback = 0): number {
  const match = markdown.match(regex);
  return match ? Number(match[1]) : fallback;
}

function parseReport(markdown: string): ReportSnapshot {
  const score = extractMetric(markdown, /Overall score: (\d+)\/100/);
  const criticalCount = extractMetric(markdown, /Critical findings: (\d+)/);
  const highCount = extractMetric(markdown, /High findings: (\d+)/);
  const mediumCount = extractMetric(markdown, /Medium findings: (\d+)/);
  const maturityMatch = markdown.match(/Maturity level: ([a-z_]+)/i);
  const maturity = maturityMatch?.[1] ?? 'unknown';

  const findings: ReportSnapshot['findings'] = [];
  const findingRegex = /### [^\n]+\((INFO|LOW|MEDIUM|HIGH|CRITICAL) \/ (passed|missing|partial|unknown)\)[\s\S]*?- ID: ([^\n]+)/g;
  for (const match of markdown.matchAll(findingRegex)) {
    findings.push({
      severity: match[1].toLowerCase(),
      status: match[2],
      id: match[3].trim(),
    });
  }

  findings.sort((a, b) => a.id.localeCompare(b.id));

  return {
    score,
    maturity,
    criticalCount,
    highCount,
    mediumCount,
    findings,
  };
}

/**
 * Renders a report from a fixture in this repository.
 *
 * These snapshots used to read checked-in reports of real private projects. That made
 * the suite depend on someone's application weaknesses being committed here, and those
 * files could not survive the repository becoming public. Generating from a fixture is
 * also the better test: it exercises the pipeline end to end and cannot drift from the
 * code that produces it.
 */
async function renderFixtureReport(
  fixtureName: string,
  profile?: Parameters<typeof buildReport>[1],
): Promise<string> {
  const analysis = await analyzeProject(path.resolve(__dirname, 'fixtures', fixtureName));
  return renderMarkdown(buildReport(analysis, profile));
}

describe('report snapshots', () => {
  it('matches structured snapshot for a hardened express fixture', async () => {
    const markdown = await renderFixtureReport('express-secure', { profile: 'b2b-saas' });
    const parsed = parseReport(markdown);
    expect(parsed).toMatchSnapshot();
  });

  it('matches structured snapshot for an unhardened express fixture', async () => {
    const markdown = await renderFixtureReport('express-basic', { profile: 'b2b-saas' });
    const parsed = parseReport(markdown);
    expect(parsed).toMatchSnapshot();
  });
});
