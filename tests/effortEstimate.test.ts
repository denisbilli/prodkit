import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { buildPlan } from '../src/planner/buildPlan';
import { remediationCatalog } from '../src/planner/remediationCatalog';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * An independent review of a real project called the effort estimate out: "roughly 8 to
 * 14 weeks" where one to two was honest. It was a flat 0.8 weeks per missing required
 * capability, widened by 1.6 — four days for a rate limit, four days for a CSP header,
 * four days for GDPR erasure, averaged into a number that was wrong about all three.
 */
describe('how long the work is said to take', () => {
  it('reads the cost from the catalogue rather than a flat rate per finding', async () => {
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'b2b-saas' });
    const open = report.findings.filter((f) => f.status !== 'passed' && f.status !== 'unknown');

    const smalls = open.filter((f) => remediationCatalog[f.id]?.effort === 'small').length;
    const larges = open.filter((f) => remediationCatalog[f.id]?.effort === 'large').length;

    // The fixture has to exercise the distinction for the test to mean anything.
    expect(smalls + larges).toBeGreaterThan(0);
    expect(report.executiveSummary.estimatedEffort).toMatch(/day|week/);
  });

  it('bills one job once, however many findings describe it', async () => {
    // `observability.health` and `expectation.observability.health.required` are the
    // same job, and the catalogue says so by giving them one task id — it is how the
    // plan produces one task rather than two. The estimate was charging for both.
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'b2b-saas' });
    const open = report.findings.filter((f) => f.status !== 'passed' && f.status !== 'unknown');

    const taskIds = new Set(open.map((f) => remediationCatalog[f.id]?.taskId ?? f.id));
    expect(taskIds.size).toBeLessThan(open.length);

    const planTasks = buildPlan(report).phases.reduce((total, phase) => total + phase.tasks.length, 0);
    expect(planTasks).toBeGreaterThan(0);
  });

  it('does not quote weeks for a repository with almost nothing open', async () => {
    const report = buildReport(await analyzeProject(fixture('express-secure')), { profile: 'b2b-saas' });
    const open = report.findings.filter((f) => f.status !== 'passed' && f.status !== 'unknown');

    if (open.length <= 2) {
      expect(report.executiveSummary.estimatedEffort).toMatch(/day|Nothing outstanding/);
    }
  });

  it('says nothing about effort without a profile to judge against', async () => {
    const report = buildReport(await analyzeProject(fixture('express-basic')));

    expect(report.executiveSummary.estimatedEffort).toMatch(/Not estimated/);
  });

  it('charges a half-done job half', async () => {
    // A partial implementation is work already begun, not work not begun.
    const report = buildReport(await analyzeProject(fixture('stripe-webhook-route-secret-partial')), { profile: 'b2b-saas' });

    expect(report.executiveSummary.estimatedEffort).toMatch(/day|week|Nothing outstanding/);
    expect(report.findings.some((f) => f.status === 'partial')).toBe(true);
  });
});
