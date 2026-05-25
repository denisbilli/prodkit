import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

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
      /\bstripe\b/i,
      /STRIPE_[A-Z0-9_]+/,
      /stripeCustomerId/i,
      /stripeSubscriptionId/i,
      /\/webhooks?\/stripe/i,
      /\/stripe\/webhooks?/i,
    ],
    30
  );

  const hasStrongStripeSignal = hasStripeDep || stripeContextHits.length > 0;

  const webhookRouteHits = hasStrongStripeSignal
    ? await searchInFiles(
      ctx.root,
      ctx.files.source,
      [
        /\/webhooks?\b/i,
        /\/webhooks?\/stripe/i,
        /app\.post\(\s*['\"][^'\"]*webhook/i,
        /router\.post\(\s*['\"][^'\"]*webhook/i,
      ],
      40
    )
    : [];

  const rawBodyHits = hasStrongStripeSignal
    ? await searchInFiles(ctx.root, ctx.files.source, [/express\.raw\(/i, /req\.rawBody/i], 20)
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
        /['\"]stripe-signature['\"]/i,
        /validateSignature/i,
      ],
      25
    )
    : [];

  for (const m of [...stripeContextHits, ...webhookRouteHits, ...rawBodyHits, ...secretHits, ...signatureHits]) {
    evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
  }

  return [
    {
      key: 'billing.stripe',
      present: hasStrongStripeSignal,
      evidence,
      details: {
        stripe: hasStrongStripeSignal,
      },
    },
    {
      key: 'billing.webhook.route',
      present: webhookRouteHits.length > 0,
      evidence: toEvidence(webhookRouteHits),
    },
    {
      key: 'billing.webhook.rawBody',
      present: rawBodyHits.length > 0,
      evidence: toEvidence(rawBodyHits),
    },
    {
      key: 'billing.webhook.secret',
      present: secretHits.length > 0,
      evidence: toEvidence(secretHits),
    },
    {
      key: 'billing.webhook.signatureValidation',
      present: signatureHits.length > 0,
      evidence: toEvidence(signatureHits),
    },
  ];
}
