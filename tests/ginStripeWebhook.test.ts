import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function webhook(handler: string, extra: Record<string, string> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-ente-'));
  await fs.writeFile(path.join(root, 'go.mod'), 'module github.com/ente-io/museum\n\ngo 1.23\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.10.0\n\tgithub.com/stripe/stripe-go/v72 v72.122.0\n)\n');
  await fs.mkdir(path.join(root, 'pkg/api'), { recursive: true });
  await fs.writeFile(path.join(root, 'pkg/api/billing.go'), handler);
  for (const [name, content] of Object.entries(extra)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const detectors = (await analyzeProject(root)).detectors;
  await fs.rm(root, { recursive: true, force: true });
  return {
    rawBody: detectors['billing.webhook.rawBody']?.present,
    secret: detectors['billing.webhook.secret']?.present,
  };
}

/** ente verifies Stripe's webhooks in Gin with a secret read from viper, and was partial. */
describe('A Stripe webhook in Gin', () => {
  it('reads the raw body and passes the secret', async () => {
    expect(await webhook('package api\n\nimport "github.com/stripe/stripe-go/v72/webhook"\n\nfunc (h *BillingHandler) StripeWebhook(c *gin.Context) {\n\tpayload, _ := io.ReadAll(c.Request.Body)\n\tevent, err := webhook.ConstructEvent(payload, c.GetHeader("Stripe-Signature"), viper.GetString("stripe.us.webhook-secret"))\n\t_, _ = event, err\n}\n')).toEqual({ rawBody: true, secret: true });
  });

  it('has no secret where the signature is not checked', async () => {
    expect(await webhook('package api\n\nimport "github.com/stripe/stripe-go/v72/webhook"\n\nfunc (h *BillingHandler) StripeWebhook(c *gin.Context) {\n\tvar event stripe.Event\n\t_ = c.BindJSON(&event)\n}\n')).toEqual({ rawBody: false, secret: false });
  });

  it('has no secret from configuration when a literal is passed', async () => {
    expect((await webhook('package api\n\nimport "github.com/stripe/stripe-go/v72/webhook"\n\nfunc (h *BillingHandler) StripeWebhook(c *gin.Context) {\n\tpayload, _ := io.ReadAll(c.Request.Body)\n\twebhookSecret := "whsec_local"\n\tevent, err := webhook.ConstructEvent(payload, c.GetHeader("Stripe-Signature"), webhookSecret)\n\t_, _ = event, err\n}\n')).secret).toBe(false);
  });

  it('reads a secret key spelled with an underscore', async () => {
    expect((await webhook('package api\n\nimport "github.com/stripe/stripe-go/v72/webhook"\n\nfunc (h *BillingHandler) StripeWebhook(c *gin.Context) {\n\tpayload, _ := io.ReadAll(c.Request.Body)\n\tevent, err := webhook.ConstructEvent(payload, c.GetHeader("Stripe-Signature"), viper.GetString("stripe.webhook_secret"))\n\t_, _ = event, err\n}\n')).secret).toBe(true);
  });

  const literal = 'package api\n\nimport "github.com/stripe/stripe-go/v72/webhook"\n\nfunc (h *BillingHandler) StripeWebhook(c *gin.Context) {\n\tpayload, _ := io.ReadAll(c.Request.Body)\n\tevent, err := webhook.ConstructEvent(payload, c.GetHeader("Stripe-Signature"), "whsec_local")\n\t_, _ = event, err\n}\n';

  /** ToolJet's git sync keeps a `webhook_secret` column; it signs no payment. */
  it("is not another feature's webhook secret", async () => {
    expect((await webhook(literal, { 'pkg/gitsync/entity.go': 'package gitsync\n\ntype Sync struct {\n\tSecret string `db:"webhook_secret"`\n}\n' })).secret).toBe(false);
  });

  it("is the processor's file even when the key does not name it", async () => {
    expect((await webhook(literal, { 'pkg/controller/stripe.go': 'package controller\n\nfunc secret() string { return viper.GetString("billing.webhook-secret") }\n' })).secret).toBe(true);
  });
});
