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

  it('does not treat generic role/workspace/export words as authz-tenancy-gdpr signals', async () => {
    const analysis = await analyzeProject(fixture('express-keyword-noise'));
    const report = buildReport(analysis);

    const authz = report.findings.find((f) => f.id === 'authz.resource-level');
    const tenancy = report.findings.find((f) => f.id === 'tenancy.b2b');
    const gdpr = report.findings.find((f) => f.id === 'gdpr.privacy');

    expect(authz?.status).toBe('unknown');
    expect(tenancy?.status).toBe('unknown');
    expect(gdpr?.status).toBe('unknown');
  });

  it('detects fastapi backend from PEP 621 pyproject dependencies', async () => {
    const analysis = await analyzeProject(fixture('fastapi-basic'));

    expect(analysis.stack.backend).toContain('fastapi');
    expect(analysis.stack.databases).toContain('postgres');
    expect(analysis.pythonDeps).toContain('fastapi');
    expect(analysis.pythonDeps).toContain('uvicorn');
    expect(analysis.pythonDeps).not.toContain('name');
    expect(analysis.pythonDeps).not.toContain('version');

    const backendWs = analysis.stack.workspaces.find((w) => w.root === '.');
    expect(backendWs?.backend).toContain('fastapi');
  });

  it('detects Next.js as a backend framework alongside React', async () => {
    const analysis = await analyzeProject(fixture('nextjs-app'));
    expect(analysis.stack.backend).toContain('next');
    expect(analysis.stack.frontend).toContain('react');
  });

  it('detects a NestJS backend from @nestjs/core', async () => {
    const analysis = await analyzeProject(fixture('nestjs-api'));
    expect(analysis.stack.backend).toContain('nestjs');
    expect(analysis.stack.databases).toContain('postgres');
  });

  it('detects a Vue frontend', async () => {
    const analysis = await analyzeProject(fixture('vue-app'));
    expect(analysis.stack.frontend).toContain('vue');
    expect(analysis.stack.backend).toEqual([]);
  });

  it('detects a Flask backend and postgres from requirements.txt', async () => {
    const analysis = await analyzeProject(fixture('flask-api'));
    expect(analysis.stack.backend).toContain('flask');
    expect(analysis.stack.databases).toContain('postgres');
  });

  it('detects fastapi and postgres from Poetry-style dependency tables', async () => {
    const analysis = await analyzeProject(fixture('fastapi-poetry'));

    expect(analysis.stack.backend).toContain('fastapi');
    expect(analysis.stack.databases).toContain('postgres');
    expect(analysis.pythonDeps).toContain('fastapi');
    expect(analysis.pythonDeps).toContain('uvicorn');
    // The Poetry table key "python" is a runtime marker, not a dependency.
    expect(analysis.pythonDeps).not.toContain('python');
    // Section headers must never leak in as dependency names.
    expect(analysis.pythonDeps).not.toContain('tool.poetry.dependencies');
  });

  it('does not raise tenancy findings for a frontend-only app with billing keywords', async () => {
    const analysis = await analyzeProject(fixture('react-frontend-billing'));
    const report = buildReport(analysis);

    expect(analysis.stack.frontend).toContain('react');
    expect(analysis.stack.backend).toEqual([]);

    const tenancy = report.findings.find((f) => f.id === 'tenancy.b2b');
    expect(tenancy?.status).toBe('unknown');
    expect(tenancy?.description).toContain('No backend detected');
  });

  it('still raises tenancy findings when a backend with B2B signals lacks tenant boundaries', async () => {
    const analysis = await analyzeProject(fixture('tenant-missing'));
    const report = buildReport(analysis);

    expect(analysis.stack.backend.length).toBeGreaterThan(0);

    const tenancy = report.findings.find((f) => f.id === 'tenancy.b2b');
    expect(tenancy?.status).toBe('missing');
    expect(tenancy?.severity).toBe('high');
  });
});
