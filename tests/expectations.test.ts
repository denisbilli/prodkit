import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { buildPlan } from '../src/planner/buildPlan';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('product profile expectations', () => {
  it('keeps observed-only behavior when no profile is provided', async () => {
    const analysis = await analyzeProject(fixture('react-vite'));
    const report = buildReport(analysis);

    expect(report.expectedCapabilityScore).toBeUndefined();
    expect(report.productProfile).toBeUndefined();

    // Nothing is blended in, so the overall score is the observed one — as far as the
    // coverage ceiling allows. This fixture is four files and rests on a handful of
    // checks, which is exactly the case the ceiling exists for.
    expect(report.overallScore).toBe(Math.min(report.observedScore, 84));
  });

  it('applies b2b-saas expectations and lowers final score on a frontend-only fixture', async () => {
    const analysis = await analyzeProject(fixture('react-vite'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });
    const plan = buildPlan(report);

    expect(report.expectedCapabilityScore).toBeDefined();
    expect((report.expectedCapabilityScore ?? 100)).toBeLessThan(report.observedScore);
    expect(report.findings.some((f) => f.id === 'expectation.auth.required')).toBe(true);
    expect(report.findings.some((f) => f.id === 'expectation.tenancy.organization.required')).toBe(true);
    expect(report.findings.some((f) => f.id === 'expectation.tenancy.isolation.required')).toBe(true);
    // Recommended, not required. Consent is one of the six lawful bases in Article 6,
    // and a B2B SaaS processing its customer's data to deliver a contract relies on
    // that contract rather than on consent. This test encoded the older, stricter
    // reading, which asked every B2B product for a mechanism the law does not require
    // and most deliberately do not build.
    expect(report.findings.some((f) => f.id === 'expectation.gdpr.consent.recommended')).toBe(true);
    expect(report.findings.some((f) => f.id === 'expectation.gdpr.erasure.required')).toBe(true);
    expect(plan.tasks.some((t) => t.id === 'remediate.auth.core')).toBe(true);
    expect(plan.tasks.some((t) => t.id === 'remediate.tenancy.organization')).toBe(true);
    expect(plan.tasks.some((t) => t.id === 'remediate.tenancy.isolation')).toBe(true);
    expect(plan.tasks.some((t) => t.id === 'remediate.gdpr.erasure')).toBe(true);
  });

  it('marks auth/tenancy/billing as non-actionable under static-site profile', async () => {
    const analysis = await analyzeProject(fixture('react-vite'));
    const report = buildReport(analysis, { profile: 'static-site' });

    expect(report.expectedCapabilityScore).toBeDefined();
    expect(report.findings.some((f) => f.id === 'expectation.auth.required')).toBe(false);
    expect(report.findings.some((f) => f.id.startsWith('expectation.tenancy'))).toBe(false);
    expect(report.findings.some((f) => f.id.startsWith('expectation.billing'))).toBe(false);
    expect(report.overallScore).toBeGreaterThan(70);
  });

  it('keeps observed-only behavior in auto mode when confidence is low', async () => {
    const analysis = await analyzeProject(fixture('auto-inconclusive'));
    const report = buildReport(analysis, { profile: 'auto' });

    expect(report.expectedCapabilityScore).toBeUndefined();
    expect(report.productProfile?.selectedProfile).toBe('auto');
    expect(report.productProfile?.inferenceConfidence).toBe('low');
    expect(report.overallScore).toBe(report.observedScore);
    expect(report.findings.some((finding) => finding.id.startsWith('expectation.'))).toBe(false);
  });

  it('applies inferred expectations in auto mode when confidence is not low', async () => {
    const analysis = await analyzeProject(fixture('stripe-webhook-secret-only'));
    const report = buildReport(analysis, { profile: 'auto' });

    expect(report.expectedCapabilityScore).toBeDefined();
    expect(report.productProfile?.inferredProfile).toBe('b2b-saas');
    expect(report.productProfile?.inferenceConfidence === 'medium' || report.productProfile?.inferenceConfidence === 'high').toBe(true);
  });

  it('uses stronger requirement severity for missing logging in ai-saas profile', async () => {
    const analysis = await analyzeProject(fixture('express-basic'));
    const b2b = buildReport(analysis, { profile: 'b2b-saas' });
    const ai = buildReport(analysis, { profile: 'ai-saas' });

    const b2bLogging = b2b.findings.find((f) => f.id === 'expectation.observability.logging.recommended');
    const aiLogging = ai.findings.find((f) => f.id === 'expectation.observability.logging.required');
    const aiRateLimit = ai.findings.find((f) => f.id === 'expectation.security.rate-limit.required');

    expect(b2bLogging).toBeDefined();
    expect(aiLogging).toBeDefined();
    expect(aiRateLimit).toBeDefined();
    expect(aiLogging?.severity === 'high' || aiLogging?.severity === 'critical').toBe(true);
  });

  it('merges duplicated remediation tasks when both base and expectation findings map to same task', async () => {
    const analysis = await analyzeProject(fixture('tenant-missing'));
    const report = buildReport(analysis, { profile: 'b2b-saas' });
    const plan = buildPlan(report);

    const ids = plan.tasks.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);

    const authTask = plan.tasks.find((task) => task.id === 'remediate.auth.core');
    expect(authTask).toBeDefined();
    expect((authTask?.findingIds ?? []).length).toBeGreaterThan(1);
  });
});