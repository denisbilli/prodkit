import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function signature(file: string, content: string, manifest: [string, string]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-lago-'));
  await fs.writeFile(path.join(root, manifest[0]), manifest[1]);
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), content);
  const found = (await analyzeProject(root)).detectors['billing.webhook.signatureValidation']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

const gemfile: [string, string] = ['Gemfile', 'source "https://rubygems.org"\n\ngem "rails", "~> 8.0"\ngem "stripe"\n'];

/** lago checks Stripe's signature with the Ruby SDK's verify_header and read as not checking. */
describe("Stripe's verify_header", () => {
  it('is the signature being checked in Ruby', async () => {
    expect(await signature('app/services/stripe/validate_incoming_webhook_service.rb', 'class ValidateIncomingWebhookService\n  def call\n    ::Stripe::Webhook::Signature.verify_header(payload, signature, webhook_secret, tolerance: 300)\n  end\nend\n', gemfile)).toBe(true);
  });

  it('is the signature being checked in JavaScript', async () => {
    expect(await signature('src/webhooks.js', 'export const check = (stripe, body, sig, secret) => stripe.webhooks.signature.verifyHeader(body, sig, secret);\n', ['package.json', JSON.stringify({ dependencies: { express: '4.19.0', stripe: '16.0.0' } })])).toBe(true);
  });

  it('is not a webhook read without checking', async () => {
    expect(await signature('app/controllers/webhooks_controller.rb', 'class WebhooksController < ApplicationController\n  def stripe\n    Event.create!(payload: request.body.read)\n  end\nend\n', gemfile)).toBe(false);
  });
});
