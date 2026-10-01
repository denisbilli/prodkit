import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const MIX = 'defmodule Portal.MixProject do\n  use Mix.Project\n\n  defp deps() do\n    [\n      {:phoenix, "~> 1.7"},\n      {:req, "~> 0.5"}\n    ]\n  end\nend\n';
const CLIENT = 'defmodule Portal.Billing.Stripe.APIClient do\n  def request(token, method, path, body) do\n    Req.request(method: method, url: "#{endpoint()}/v1/#{path}", body: body, auth: {:bearer, token})\n  end\nend\n';
const ENDPOINT = 'import Config\n\nconfig :portal, Portal.Billing.Stripe.APIClient, endpoint: "https://api.stripe.com"\n';
const WEBHOOK = 'defmodule PortalAPI.Integrations.Stripe.WebhookController do\n  use PortalAPI, :controller\n\n  def handle_webhook(conn, _params) do\n    [signature_header] = get_req_header(conn, "stripe-signature")\n    {:ok, body, conn} = read_body(conn, length: 1_000_000)\n    verify(conn, signature_header, body)\n  end\nend\n';
const ROUTER = 'defmodule PortalAPI.Router do\n  use Phoenix.Router\n\n  post "/integrations/stripe/webhooks", PortalAPI.Integrations.Stripe.WebhookController, :handle_webhook\nend\n';

async function billing(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-firezone-'));
  await fs.writeFile(path.join(root, 'mix.exs'), MIX);
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const found = (await analyzeProject(root)).detectors;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** firezone speaks Stripe's API over plain HTTP from Elixir, verifies its webhooks by hand, and read as having no payments. */
describe('Stripe without an SDK', () => {
  it("is Stripe by its own host", async () => {
    const found = await billing({ 'config/config.exs': ENDPOINT, 'lib/portal/billing/stripe/api_client.ex': CLIENT });
    expect(found['billing.stripe']?.present).toBe(true);
  });

  it('is not an HTTP client on its own', async () => {
    const found = await billing({ 'lib/portal/billing/stripe/api_client.ex': CLIENT });
    expect(found['billing.stripe']?.present).toBe(false);
  });

  it("reads the raw body through Plug's read_body", async () => {
    const found = await billing({ 'config/config.exs': ENDPOINT, 'lib/portal_api/router.ex': ROUTER, 'lib/portal_api/webhook_controller.ex': WEBHOOK });
    expect(found['billing.webhook.rawBody']?.present).toBe(true);
  });

  it("finds the secret under Stripe's own name for it, the signing secret", async () => {
    const found = await billing({ 'config/config.exs': ENDPOINT, 'config/runtime.exs': 'import Config\n\nconfig :portal, Portal.Billing, webhook_signing_secret: env_var_to_config!(:stripe_webhook_signing_secret)\n' });
    expect(found['billing.webhook.secret']?.present).toBe(true);
  });
});

/** hexpm lets the browser reach Stripe in its Content Security Policy, and a separate service does the billing. */
describe("Stripe's host in a Content Security Policy", () => {
  it('is not Stripe in Phoenix spelling', async () => {
    const found = await billing({ 'lib/hexpm_web/router.ex': 'defmodule HexpmWeb.Router do\n  @csp [\n    connect_src: ~w(\'self\' https://*.hcaptcha.com https://api.stripe.com)\n  ]\nend\n' });
    expect(found['billing.stripe']?.present).toBe(false);
  });

  it('is not Stripe as a header value either', async () => {
    const found = await billing({ 'lib/csp.ex': 'defmodule Csp do\n  def header, do: "default-src \'self\'; connect-src \'self\' https://api.stripe.com"\nend\n' });
    expect(found['billing.stripe']?.present).toBe(false);
  });
});
