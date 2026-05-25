import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';

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

async function loadReport(fileName: string): Promise<string> {
  const reportPath = path.resolve(__dirname, '..', 'reports', fileName);
  return fs.readFile(reportPath, 'utf8');
}

describe('real report snapshots', () => {
  it('matches structured snapshot for transcribeai report', async () => {
    const markdown = await loadReport('transcribeai.md');
    const parsed = parseReport(markdown);
    expect(parsed).toMatchSnapshot();
  });

  it('matches structured snapshot for movie-generator report', async () => {
    const markdown = await loadReport('movie-generator.md');
    const parsed = parseReport(markdown);
    expect(parsed).toMatchSnapshot();
  });
});
