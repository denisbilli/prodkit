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
    expect(analysis.stack.packageManager).toBe('npm');
    expect(analysis.stack.packageManagerConfidence).toBe('manifest');
    expect(analysis.stack.warnings).toContain('package-lock missing');

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
    expect(analysis.stack.packageManager).toBe('pip');
    expect(analysis.stack.packageManagerConfidence).toBe('manifest');

    const debug = report.findings.find((f) => f.id === 'security.django-debug');
    const cookies = report.findings.find((f) => f.id === 'security.django-secure-cookies');

    expect(debug?.severity).toBe('critical');
    expect(debug?.status).toBe('missing');
    expect(cookies?.severity).toBe('high');
    expect(cookies?.status).toBe('missing');
  });

  it('flags public uploads even if auth exists elsewhere', async () => {
    const analysis = await analyzeProject(fixture('express-public-uploads-with-auth-elsewhere'));
    const report = buildReport(analysis);
    const uploads = report.findings.find((f) => f.id === 'uploads.public-exposure');

    expect(uploads?.status).toBe('missing');
    expect(uploads?.severity).toBe('high');
  });

  it('accepts protected uploads on the same route declaration', async () => {
    const analysis = await analyzeProject(fixture('express-protected-uploads-same-route'));
    const report = buildReport(analysis);
    const uploads = report.findings.find((f) => f.id === 'uploads.public-exposure');

    expect(uploads?.status).toBe('passed');
  });

  it('detects strict CORS when options object is passed by variable', async () => {
    const analysis = await analyzeProject(fixture('express-cors-options-variable'));
    const report = buildReport(analysis);
    const cors = report.findings.find((f) => f.id === 'security.cors-origin');

    expect(cors?.status).toBe('passed');
  });

  it('detects Stripe webhook hardening with custom signature flow', async () => {
    const analysis = await analyzeProject(fixture('express-stripe-custom-signature'));
    const report = buildReport(analysis);
    const billing = report.findings.find((f) => f.id === 'billing.webhook-signature');

    expect(billing?.status).toBe('passed');
  });

  it('does not flag DEBUG missing when Django debug is env-driven', async () => {
    const analysis = await analyzeProject(fixture('django-debug-from-env'));
    const report = buildReport(analysis);
    const debug = report.findings.find((f) => f.id === 'security.django-debug');

    expect(debug?.status).toBe('passed');
  });

  it('does not flag secure cookies missing on conditional Django config', async () => {
    const analysis = await analyzeProject(fixture('django-secure-cookies-conditional'));
    const report = buildReport(analysis);
    const cookies = report.findings.find((f) => f.id === 'security.django-secure-cookies');

    expect(cookies?.status).toBe('passed');
  });

  it('detects frontend and backend in monorepo with subfolders', async () => {
    const analysis = await analyzeProject(fixture('monorepo-with-frontend-and-backend-subfolders'));

    expect(analysis.stack.frontend).toContain('react');
    expect(analysis.stack.frontend).toContain('vite');
    expect(analysis.stack.frontend).toContain('electron');
    expect(analysis.stack.backend).toContain('express');
    expect(analysis.stack.databases).toContain('postgres');
    expect(analysis.stack.databases).toContain('redis');

    const workspaceRoots = analysis.stack.workspaces.map((w) => w.root);
    expect(workspaceRoots).toContain('.');
    expect(workspaceRoots).toContain('frontend');
    expect(workspaceRoots).toContain('backend');
    expect(workspaceRoots).toContain('electron');

    const backendWs = analysis.stack.workspaces.find((w) => w.root === 'backend');
    expect(backendWs?.backend).toContain('express');
    expect(backendWs?.databases).toContain('postgres');
  });
});
