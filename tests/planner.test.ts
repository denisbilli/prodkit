import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { buildPlan } from '../src/planner/buildPlan';
import { renderJsonPlan } from '../src/planner/jsonPlan';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('planner', () => {
  it('creates remediation tasks for express-basic', async () => {
    const analysis = await analyzeProject(fixture('express-basic'));
    const report = buildReport(analysis);
    const plan = buildPlan(report);

    const taskIds = plan.tasks.map((task) => task.id);
    expect(taskIds).toContain('remediate.security.weak-secret');
    expect(taskIds).toContain('remediate.uploads.public-exposure');
    expect(taskIds).toContain('remediate.security.helmet');

    expect(plan.quickWins.length).toBeGreaterThan(0);
    expect(plan.quickWins.every((task) => task.effort === 'small' && (task.risk === 'low' || task.risk === 'medium'))).toBe(true);
  });

  it('keeps critical remediation pressure low for express-secure', async () => {
    const analysis = await analyzeProject(fixture('express-secure'));
    const report = buildReport(analysis);
    const plan = buildPlan(report);

    expect(plan.tasks.filter((task) => task.priority === 'p0').length).toBe(0);
  });

  it('does not create a Stripe webhook task without strong Stripe signals', async () => {
    const analysis = await analyzeProject(fixture('movie-like-billing-no-stripe'));
    const report = buildReport(analysis);
    const plan = buildPlan(report);

    expect(plan.tasks.some((task) => task.id === 'remediate.billing.webhook-signature')).toBe(false);
  });

  it('creates a tenant model task when tenancy risk is missing', async () => {
    const analysis = await analyzeProject(fixture('tenant-missing'));
    const report = buildReport(analysis);
    const tenancy = report.findings.find((finding) => finding.id === 'tenancy.b2b');
    const plan = buildPlan(report);

    expect(tenancy?.status).toBe('missing');
    expect(plan.tasks.some((task) => task.id === 'remediate.tenancy.b2b')).toBe(true);
  });

  it('renders JSON plan output with phases and tasks', async () => {
    const analysis = await analyzeProject(fixture('express-basic'));
    const report = buildReport(analysis);
    const plan = buildPlan(report);
    const parsed = JSON.parse(renderJsonPlan(plan)) as { phases: unknown[]; tasks: unknown[]; summary: string };

    expect(Array.isArray(parsed.phases)).toBe(true);
    expect(parsed.phases.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.tasks)).toBe(true);
    expect(parsed.tasks.length).toBeGreaterThan(0);
    expect(typeof parsed.summary).toBe('string');
  });
});
describe('remediation plan ordering', () => {
  // Ranking by priority, severity and title alone produced plans that could not be
  // followed in the order given: "Enforce tenant isolation on every query" sorted
  // above "Implement an explicit authentication baseline" because E precedes I.
  it('never lists a task before a task it depends on', async () => {
    const analysis = await analyzeProject(path.resolve(__dirname, 'fixtures', 'nestjs-api'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });
    const plan = buildPlan(report);

    const positions = new Map(plan.tasks.map((task, index) => [task.id, index]));

    for (const task of plan.tasks) {
      for (const dependency of task.dependencies) {
        const dependencyPosition = positions.get(dependency);
        if (dependencyPosition === undefined) continue;

        expect(dependencyPosition).toBeLessThan(positions.get(task.id)!);
      }
    }
  });

  it('treats a missing authentication baseline as a P0 blocker', async () => {
    const analysis = await analyzeProject(path.resolve(__dirname, 'fixtures', 'nestjs-api'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });
    const plan = buildPlan(report);

    const authTask = plan.tasks.find((task) => task.id === 'remediate.auth.core');
    expect(authTask?.priority).toBe('p0');
    expect(plan.tasks[0].id).toBe('remediate.auth.core');
  });
});
