import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { renderMarkdown } from '../src/report/markdownReport';
import { describeReadingDepth, readingDepths } from '../src/analyzer/readingDepth';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Sixty-eight keyword searches against one structural claim, and six of eighteen
 * readable extensions covered by a parser. A report on a Go project and a report on a
 * TypeScript project looked equally sure of themselves, and were not.
 *
 * This is the same failure as everything else corrected on 18 September — saying more
 * than can be shown — applied to the analyzer's own method rather than to a finding.
 */
describe('the report says how it read the code', () => {
  it('calls a language parsed only where a parser reads it', async () => {
    const analysis = await analyzeProject(fixture('roles-and-chat'));
    const readings = readingDepths(analysis.files.source, analysis.files.unreadable);

    expect(readings.find((entry) => entry.language === 'JavaScript')?.depth).toBe('parsed');
  });

  it('calls a language searched where only keywords reach it', async () => {
    const analysis = await analyzeProject(fixture('django-basic'));
    const readings = readingDepths(analysis.files.source, analysis.files.unreadable);

    expect(readings.find((entry) => entry.language === 'Python')?.depth).toBe('searched');
  });

  it('counts a language it cannot read at all as skipped', async () => {
    const analysis = await analyzeProject(fixture('phoenix-app'));
    const readings = readingDepths(analysis.files.source, analysis.files.unreadable);

    expect(readings.find((entry) => entry.language === 'Elixir')?.depth).toBe('skipped');
  });

  it('says nothing when everything was parsed', () => {
    // A report congratulating itself on reading properly is noise.
    expect(describeReadingDepth([{ language: 'TypeScript', files: 40, depth: 'parsed' }])).toBeUndefined();
  });

  it('tells the reader, rather than only the diagnostics', async () => {
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'auto' });
    const markdown = renderMarkdown(report);

    expect(markdown).toMatch(/How this repository was read/);
    expect(markdown).toMatch(/Python/);
    expect(markdown).toMatch(/rest on weaker evidence/);
  });
});
