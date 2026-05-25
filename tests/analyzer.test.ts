import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('analyzer fixtures', () => {
  it('detects express-basic with low security posture', async () => {
    const analysis = await analyzeProject(fixture('express-basic'));
    const report = buildReport(analysis);

    expect(analysis.stack.backend).toContain('express');
    expect(analysis.stack.packageManager).toBe('unknown');

    const weak = report.findings.find((f) => f.id === 'security.weak-secret');
    const uploads = report.findings.find((f) => f.id === 'uploads.public-exposure');
    const helmet = report.findings.find((f) => f.id === 'security.helmet');
    const rate = report.findings.find((f) => f.id === 'security.rate-limit-auth');

    expect(weak?.severity).toBe('critical');
    expect(weak?.status).not.toBe('passed');
    expect(uploads?.severity).toBe('high');
    expect(helmet?.status).toBe('missing');
    expect(rate?.status).toBe('missing');
    expect(report.overallScore).toBeLessThan(70);
  });

  it('detects express-secure with stronger posture', async () => {
    const analysis = await analyzeProject(fixture('express-secure'));
    const report = buildReport(analysis);

    expect(analysis.stack.backend).toContain('express');

    const helmet = report.findings.find((f) => f.id === 'security.helmet');
    const rate = report.findings.find((f) => f.id === 'security.rate-limit-auth');
    const health = report.findings.find((f) => f.id === 'observability.health');

    expect(helmet?.status).toBe('passed');
    expect(rate?.status).toBe('passed');
    expect(health?.status).toBe('passed');
    expect(report.overallScore).toBeGreaterThan(75);
  });

  it('detects react-vite frontend', async () => {
    const analysis = await analyzeProject(fixture('react-vite'));
    expect(analysis.stack.frontend).toContain('react');
    expect(analysis.stack.frontend).toContain('vite');
    expect(analysis.stack.backend.length).toBe(0);
  });

  it('detects django-basic security warnings', async () => {
    const analysis = await analyzeProject(fixture('django-basic'));
    const report = buildReport(analysis);

    expect(analysis.stack.backend).toContain('django');

    const debug = report.findings.find((f) => f.id === 'security.django-debug');
    const cookies = report.findings.find((f) => f.id === 'security.django-secure-cookies');

    expect(debug?.severity).toBe('critical');
    expect(debug?.status).toBe('missing');
    expect(cookies?.severity).toBe('high');
    expect(cookies?.status).toBe('missing');
  });
});
