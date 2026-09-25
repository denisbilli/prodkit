import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('billing webhook sub-detectors', () => {
  it('passes a Next.js webhook whose route is a file path, not a string', async () => {
    // The regression this covers: every control was correctly in place and the rule
    // still reported `partial`, because the route patterns looked for the URL written
    // out in code and an App Router handler never writes it anywhere, and because the
    // raw-body patterns only knew the Express spelling.
    const analysis = await analyzeProject(fixture('nextjs-stripe-webhook-hardened'));

    expect(analysis.detectors['billing.webhook.route']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.secret']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.signatureValidation']?.present).toBe(true);

    const report = buildReport(analysis);
    expect(report.findings.find((f) => f.id === 'billing.webhook-signature')?.status).toBe('passed');
  });

  /**
   * bitwarden/server's shape: `[Route("stripe")]` and `[HttpPost("webhook")]` on the
   * controller, the body read with a `StreamReader` before `EventUtility.ConstructEvent`.
   * No path string and no Express spelling, so it was told at `high` that its callbacks
   * go unverified.
   */
  it('passes an ASP.NET controller that verifies Stripe on an attribute route', async () => {
    const analysis = await analyzeProject(fixture('aspnet-stripe-webhook'));

    expect(analysis.detectors['billing.webhook.route']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.signatureValidation']?.present).toBe(true);
  });

  it('passes a FastAPI webhook that awaits request.body()', async () => {
    const analysis = await analyzeProject(fixture('fastapi-stripe-webhook-hardened'));

    expect(analysis.detectors['billing.webhook.route']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(true);

    const report = buildReport(analysis);
    expect(report.findings.find((f) => f.id === 'billing.webhook-signature')?.status).toBe('passed');
  });

  it('detects webhook route signal only', async () => {
    const analysis = await analyzeProject(fixture('stripe-webhook-route-only'));

    expect(analysis.detectors['billing.webhook.route']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(false);
    expect(analysis.detectors['billing.webhook.secret']?.present).toBe(false);
    expect(analysis.detectors['billing.webhook.signatureValidation']?.present).toBe(false);

    const report = buildReport(analysis);
    const billing = report.findings.find((f) => f.id === 'billing.webhook-signature');
    expect(billing?.status).toBe('missing');
  });

  it('detects raw body signal only', async () => {
    const analysis = await analyzeProject(fixture('stripe-webhook-rawbody-only'));

    expect(analysis.detectors['billing.webhook.route']?.present).toBe(false);
    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.secret']?.present).toBe(false);
    expect(analysis.detectors['billing.webhook.signatureValidation']?.present).toBe(false);

    const report = buildReport(analysis);
    const billing = report.findings.find((f) => f.id === 'billing.webhook-signature');
    expect(billing?.status).toBe('missing');
  });

  it('detects webhook secret signal only', async () => {
    const analysis = await analyzeProject(fixture('stripe-webhook-secret-only'));

    expect(analysis.detectors['billing.webhook.route']?.present).toBe(false);
    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(false);
    expect(analysis.detectors['billing.webhook.secret']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.signatureValidation']?.present).toBe(false);

    const report = buildReport(analysis);
    const billing = report.findings.find((f) => f.id === 'billing.webhook-signature');
    expect(billing?.status).toBe('missing');
  });

  it('detects signature validation signal only', async () => {
    const analysis = await analyzeProject(fixture('stripe-webhook-signature-only'));

    expect(analysis.detectors['billing.webhook.route']?.present).toBe(false);
    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(false);
    expect(analysis.detectors['billing.webhook.secret']?.present).toBe(false);
    expect(analysis.detectors['billing.webhook.signatureValidation']?.present).toBe(true);

    const report = buildReport(analysis);
    const billing = report.findings.find((f) => f.id === 'billing.webhook-signature');
    expect(billing?.status).toBe('missing');
  });

  it('marks full stripe webhook hardening as passed', async () => {
    const analysis = await analyzeProject(fixture('express-stripe-custom-signature'));

    expect(analysis.detectors['billing.webhook.route']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.secret']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.signatureValidation']?.present).toBe(true);

    const report = buildReport(analysis);
    const billing = report.findings.find((f) => f.id === 'billing.webhook-signature');
    expect(billing?.status).toBe('passed');
  });

  it('marks stripe webhook hardening as partial when route+secret exist without raw body/signature', async () => {
    const analysis = await analyzeProject(fixture('stripe-webhook-route-secret-partial'));

    expect(analysis.detectors['billing.webhook.route']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(false);
    expect(analysis.detectors['billing.webhook.secret']?.present).toBe(true);
    expect(analysis.detectors['billing.webhook.signatureValidation']?.present).toBe(false);

    const report = buildReport(analysis);
    const billing = report.findings.find((f) => f.id === 'billing.webhook-signature');
    expect(billing?.status).toBe('partial');
  });
});
