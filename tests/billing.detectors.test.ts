import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('billing webhook sub-detectors', () => {
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
