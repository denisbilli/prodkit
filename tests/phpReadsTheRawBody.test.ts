import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(action: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-hievents-'));
  await fs.writeFile(path.join(root, 'composer.json'), '{"require":{"laravel/framework":"^11.0","stripe/stripe-php":"^16.0"}}\n');
  await fs.mkdir(path.join(root, 'app/Http/Actions'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/Http/Actions/StripeIncomingWebhookAction.php'), action);
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/** hi.events hands Stripe the body Laravel received, unparsed, and was partial. */
describe('PHP reads the raw body', () => {
  it("through Laravel's request", async () => {
    const analysis = await analyze('<?php\n$payload = $request->getContent();\n$event = Webhook::constructEvent($payload, $request->header(\'Stripe-Signature\'), $secret);\n');

    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(true);
  });

  it("through the language's input stream", async () => {
    const analysis = await analyze('<?php\n$payload = file_get_contents(\'php://input\');\n$event = \\Stripe\\Webhook::constructEvent($payload, $_SERVER[\'HTTP_STRIPE_SIGNATURE\'], $secret);\n');

    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(true);
  });

  it('not through a parsed field', async () => {
    const analysis = await analyze('<?php\n$payload = $request->input(\'data\');\n$event = Webhook::constructEvent($payload, $request->header(\'Stripe-Signature\'), $secret);\n');

    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(false);
  });

  /** SolidInvoice's AJAX actions decode the body as they read it. */
  it('not through a body decoded where it is read', async () => {
    const analysis = await analyze('<?php\n$payload = json_decode($request->getContent(), true);\n$event = Webhook::constructEvent($raw, $request->header(\'Stripe-Signature\'), $secret);\n');

    expect(analysis.detectors['billing.webhook.rawBody']?.present).toBe(false);
  });
});
