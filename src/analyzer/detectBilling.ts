import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDotnetDep, hasAnyGradleDep, hasAnyPhpDep, hasAnyPyDep, hasAnyRubyDep, hasAnyRustDep, hasDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { evidenceOrSearch } from './absenceEvidence';

function toEvidence(matches: Array<{ snippet: string; file: string; line: number }>): DetectorEvidence[] {
  return matches.map((m) => ({ type: 'snippet', value: m.snippet, file: m.file, line: m.line }));
}

export async function detectBilling(ctx: DetectContext): Promise<DetectorResult[]> {
  const evidence: DetectorEvidence[] = [];
  const hasStripeDep = hasDep(ctx, 'stripe');
  if (hasStripeDep) evidence.push({ type: 'dependency', value: 'stripe' });

  const stripeContextHits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      /**
       * The bare word is not here, on purpose.
       *
       * `\bstripe\b` matched `'table-stripe': '#f3f3f3'`, a CSS colour token for
       * zebra-striped tables, and `{['Stripe API', 'GitHub REST', …]}`, a list of API
       * names in a design-system demo. Both are in `usebruno/bruno`, a desktop API
       * client that takes no payments and was reported as a B2B SaaS.
       *
       * A project that actually charges people has the dependency, a STRIPE_ variable,
       * a customer or subscription id, or a webhook path. One that only ever writes
       * "Stripe" in prose is talking about Stripe, not billing through it.
       */
      /**
       * A Stripe credential, not any constant whose name begins with those six letters.
       *
       * `/STRIPE_[A-Z0-9_]+/` matched `STRIPE_LEN` in Unity's bundled xxHash3, where a
       * stripe is a block of bytes being hashed, and reported a game as taking
       * subscriptions. The word is only evidence of billing when it names a key, a
       * secret, a token or an id.
       */
      /STRIPE_(?:[A-Z0-9_]*_)?(?:KEY|SECRET|TOKEN|ID|WEBHOOK|PRICE|ACCOUNT|API)[A-Z0-9_]*/,
      /stripeCustomerId/i,
      /stripeSubscriptionId/i,
      /\/webhooks?\/stripe/i,
      /\/stripe\/webhooks?/i,
    ],
    30
  );

  /**
   * The processor, declared wherever this project declares its dependencies.
   *
   * `hasDep` reads `package.json` and nothing else, so a product that charges people
   * in any other language had to be caught by the `STRIPE_` variable search instead.
   * pretix is a ticketing platform with `stripe==7.9.*`, `paypalrestsdk` and
   * `paypal-checkout-serversdk` in its pyproject, and it was told at `high` that it
   * has no way to charge for the product.
   *
   * Only processors, not billing vocabulary: the `movie-like-billing-no-stripe`
   * fixture exists to hold that line, and a route called `/api/billing/plans` is
   * still not a payment integration.
   */
  const PROCESSOR_PACKAGES = ['stripe', 'braintree', 'paddle', 'lemonsqueezy', 'mollie', 'razorpay', 'adyen'];

  const processorDeps = [
    ...hasAnyPyDep(ctx, [...PROCESSOR_PACKAGES, 'paypalrestsdk', 'paypal-checkout-serversdk', 'mollie-api-python']),
    ...hasAnyRubyDep(ctx, [...PROCESSOR_PACKAGES, 'paypal-sdk-rest']),
    ...hasAnyPhpDep(ctx, ['stripe/stripe-php', 'paypal/rest-api-sdk-php', 'mollie/mollie-api-php', 'braintree/braintree_php']),
    ...hasAnyGradleDep(ctx, ['com.stripe:stripe-java', 'com.braintreepayments']),
    ...hasAnyDotnetDep(ctx, ['Stripe.net', 'Braintree', 'PayPalCheckoutSdk']),
    ...hasAnyRustDep(ctx, ['stripe-rust', 'async-stripe']),
  ];
  for (const dep of processorDeps) evidence.push({ type: 'dependency', value: dep });

  const hasStrongStripeSignal = hasStripeDep || processorDeps.length > 0 || stripeContextHits.length > 0;

  const webhookRouteHits = hasStrongStripeSignal
    ? await searchInFiles(
      ctx.root,
      ctx.files.source,
      [
        /\/webhooks?\b/i,
        /\/webhooks?\/stripe/i,
        /app\.post\(\s*['"][^'"]*webhook/i,
        /router\.post\(\s*['"][^'"]*webhook/i,
      ],
      40
    )
    : [];

  /**
   * Routes that exist as a file path rather than as a string in the code.
   *
   * The patterns above all look for the URL written out somewhere — `app.post('/webhook')`
   * and its relatives. In a file-system-routed framework the URL is never written
   * anywhere: `src/app/api/stripe/webhook/route.ts` IS the route. That covers the
   * Next.js App Router, Remix, SvelteKit, Nuxt and Astro, so the check reported "no
   * webhook route" for a correctly verified webhook and marked the whole control
   * partial.
   *
   * A `webhook` path segment is required, not a substring, so `webhooks.test.ts`
   * beside a handler does not count as a route on its own.
   */
  const webhookPathHits = hasStrongStripeSignal
    ? ctx.files.source.filter((file) => /(?:^|\/)webhooks?(?:\/|\.[cm]?[jt]sx?$)/i.test(file))
    : [];

  /**
   * Reading the body without letting a JSON parser touch it first.
   *
   * This used to look for `express.raw(` and `req.rawBody` and nothing else, which
   * made the check Express-only. A Stripe signature covers the exact bytes that were
   * sent, so every framework has an idiom for this, and outside Express none of them
   * mention "raw": a Web-standard handler (Next.js route handlers, Remix, SvelteKit,
   * Hono, Bun, Deno, Cloudflare Workers) awaits `request.text()`, Django reads
   * `request.body`, FastAPI awaits `request.body()`, Flask calls
   * `request.get_data()`. Next.js is the most common stack among the repositories
   * this tool is pointed at, so the omission failed the case it meets most often —
   * and it failed it quietly, reporting `partial` on a webhook that was correctly
   * verified.
   *
   * The Web-standard patterns are anchored to a request identifier rather than
   * matching `.text()` anywhere: a `.text()` on a fetch *response* is a different
   * thing entirely and is conventionally held in `res` or `response`.
   */
  const rawBodyHits = hasStrongStripeSignal
    ? await searchInFiles(
      ctx.root,
      ctx.files.source,
      [
        // Express, and the body-parser spelling of the same thing.
        /express\.raw\(/i,
        /bodyParser\.raw\(/i,
        /\braw_?[bB]ody\b/,
        /getRawBody\(/i,
        // Web-standard Request: Next.js route handlers, Remix, SvelteKit, Hono,
        // Bun, Deno, Cloudflare Workers.
        /\b(?:request|req)\.(?:text|arrayBuffer|blob)\(\s*\)/,
        // Python: Django, FastAPI, Flask.
        /\brequest\.body\b/,
        /\brequest\.get_data\(/,
        /\bawait\s+request\.body\(\s*\)/,
        // Go's net/http.
        /io\.ReadAll\(\s*r\.Body\s*\)/,
      ],
      20
    )
    : [];

  const secretHits = hasStrongStripeSignal
    ? await searchInFiles(ctx.root, ctx.files.source, [/STRIPE_WEBHOOK_SECRET/i, /stripeWebhookSecret/i], 20)
    : [];

  const signatureHits = hasStrongStripeSignal
    ? await searchInFiles(
      ctx.root,
      ctx.files.source,
      [
        /stripe\.webhooks\.constructEvent/i,
        /constructEvent\(/i,
        /['"]stripe-signature['"]/i,
        /validateSignature/i,
      ],
      25
    )
    : [];

  for (const m of [...stripeContextHits, ...webhookRouteHits, ...rawBodyHits, ...secretHits, ...signatureHits]) {
    evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
  }

  for (const file of webhookPathHits) {
    evidence.push({ type: 'file', value: file, file });
  }

  return [
    {
      key: 'billing.stripe',
      present: hasStrongStripeSignal,
      evidence: evidenceOrSearch(evidence, 'a payment integration', ['stripe', '@stripe/stripe-js', 'checkout.sessions.create', 'paddle', 'lemonsqueezy', 'braintree', 'a route under /webhook/stripe']),
      details: {
        stripe: hasStrongStripeSignal,
      },
    },
    {
      key: 'billing.webhook.route',
      present: webhookRouteHits.length > 0 || webhookPathHits.length > 0,
      evidence: evidenceOrSearch(
        [
          ...toEvidence(webhookRouteHits),
          ...webhookPathHits.map((file) => ({ type: 'file' as const, value: file, file })),
        ],
        'a route the payment provider calls back',
        ['/webhook', '/webhooks/stripe', 'a file under a webhook directory'],
      ),
    },
    {
      key: 'billing.webhook.rawBody',
      present: rawBodyHits.length > 0,
      evidence: evidenceOrSearch(toEvidence(rawBodyHits), 'the unparsed body a signature is computed over', ['express.raw', 'bodyParser.raw', 'request.text()', 'rawBody', 'await req.arrayBuffer()']),
    },
    {
      key: 'billing.webhook.secret',
      present: secretHits.length > 0,
      evidence: evidenceOrSearch(toEvidence(secretHits), 'the signing secret, read from configuration', ['STRIPE_WEBHOOK_SECRET', 'WEBHOOK_SIGNING_SECRET', 'whsec_']),
    },
    {
      key: 'billing.webhook.signatureValidation',
      present: signatureHits.length > 0,
      evidence: evidenceOrSearch(toEvidence(signatureHits), 'the signature being checked', ['constructEvent(', 'verifyHeader(', 'Webhook.constructEvent', 'stripe-signature']),
    },
  ];
}
