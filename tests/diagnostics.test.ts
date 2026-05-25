import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('report diagnostics', () => {
  it('includes diagnostics for observed-only reports', async () => {
    const analysis = await analyzeProject(fixture('express-basic'));
    const report = buildReport(analysis);

    expect(report.diagnostics.analyzedFileCount).toBeGreaterThan(0);
    expect(report.diagnostics.workspaceCount).toBeGreaterThan(0);
    expect(report.diagnostics.detectorCount).toBeGreaterThan(0);
    expect(report.diagnostics.detectors.length).toBeGreaterThan(0);
    expect(report.diagnostics.selectedProfile).toBe('observed-only');
    expect(report.diagnostics.expectationMode).toBe('observed-only');
    expect(report.diagnostics.prodkitVersion).toBe('0.2.0');
  });

  it('includes explicit profile diagnostics when expectations are applied', async () => {
    const analysis = await analyzeProject(fixture('react-vite'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });

    expect(report.diagnostics.selectedProfile).toBe('b2b-saas');
    expect(report.diagnostics.expectationMode).toBe('explicit-profile');
  });
});