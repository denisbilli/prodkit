import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A Flutter application was told it has no health endpoint, no Docker artifacts, to
 * adopt structured logs with request correlation ids, and to handle a shutdown signal.
 * It runs on a phone. These rules ran without ever asking what kind of thing they were
 * looking at, and reported the absence of things the project could not have.
 */
describe('an absence the project could not have had', () => {
  it('does not ask a phone application for a health endpoint', async () => {
    const report = buildReport(await analyzeProject(fixture('flutter-app')), { profile: 'mobile-app' });
    const health = report.findings.find((f) => f.id === 'observability.health');

    expect(health?.status).not.toBe('missing');
    expect(health?.description).toMatch(/answers requests|detected/i);
  });

  it('does not ask a phone application for a container', async () => {
    const report = buildReport(await analyzeProject(fixture('flutter-app')), { profile: 'mobile-app' });

    expect(report.findings.find((f) => f.id === 'docker.presence')?.status).not.toBe('missing');
  });

  it('does not ask anything with no server for a shutdown signal', async () => {
    // A phone application has no process an operator can signal: the platform stops it.
    const report = buildReport(await analyzeProject(fixture('flutter-app')), { profile: 'mobile-app' });
    const deployment = report.findings.find((f) => f.id === 'deployment.readiness');

    expect(deployment?.recommendation ?? '').not.toMatch(/graceful shutdown/i);
  });

  it('does not ask a client for request correlation ids', async () => {
    // There are no requests to correlate. What makes a phone application's failures
    // visible is a crash reporter, which is a different instruction.
    const report = buildReport(await analyzeProject(fixture('flutter-app')), { profile: 'mobile-app' });
    const logging = report.findings.find((f) => f.id === 'observability.logging');

    if (logging && logging.status !== 'passed') {
      expect(logging.recommendation).not.toMatch(/correlation/i);
      expect(logging.recommendation).toMatch(/crash/i);
    }
  });

  it('still asks all of it of something that serves requests', async () => {
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'b2b-saas' });

    expect(report.findings.find((f) => f.id === 'observability.health')?.status).toBe('missing');
    expect(report.findings.find((f) => f.id === 'docker.presence')?.status).toBe('missing');
    expect(report.findings.find((f) => f.id === 'deployment.readiness')?.recommendation).toMatch(/graceful shutdown/i);
  });

  it('does not credit a package for the words it searches for', async () => {
    // This analyzer searches source for `/health` and `/healthz`, so the tool that
    // looks for a health endpoint contains the strings it looks for. Reported against
    // itself, a command-line package with no server came back "health endpoint
    // detected". Third time this trap has been sprung, after Stripe constants in a hash
    // implementation and security headers in a pattern table.
    const report = buildReport(await analyzeProject(fixture('pattern-scanner')), { profile: 'library' });

    expect(report.findings.find((f) => f.id === 'observability.health')?.status).not.toBe('passed');
  });
});
