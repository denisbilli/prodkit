import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const manifestVersion: string = JSON.parse(
  readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8')
).version;

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
    // Pinning a literal here is what let the CLI ship 0.2.1 announcing itself as
    // 0.2.0: the test agreed with the stale constant. Assert against the manifest
    // instead, and reject the fallback the reader uses when it cannot find one.
    expect(report.diagnostics.prodkitVersion).toBe(manifestVersion);
    expect(report.diagnostics.prodkitVersion).not.toBe('0.0.0-unknown');
  });

  it('includes explicit profile diagnostics when expectations are applied', async () => {
    const analysis = await analyzeProject(fixture('react-vite'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });

    expect(report.diagnostics.selectedProfile).toBe('b2b-saas');
    expect(report.diagnostics.expectationMode).toBe('explicit-profile');
  });
});