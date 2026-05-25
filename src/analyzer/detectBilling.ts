import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

function toEvidence(matches: Array<{ snippet: string; file: string; line: number }>): DetectorEvidence[] {
  return matches.map((m) => ({ type: 'snippet', value: m.snippet, file: m.file, line: m.line }));
}

export async function detectBilling(ctx: DetectContext): Promise<DetectorResult[]> {
  const evidence: DetectorEvidence[] = [];
  const hasStripe = hasDep(ctx, 'stripe');
  if (hasStripe) evidence.push({ type: 'dependency', value: 'stripe' });

  const webhookRouteHits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      /\/webhooks?\b/i,
      /app\.post\(\s*['\"][^'\"]*webhook/i,
      /router\.post\(\s*['\"][^'\"]*webhook/i,
    ],
    40
  );
  const rawBodyHits = await searchInFiles(ctx.root, ctx.files.source, [/express\.raw\(/i, /req\.rawBody/i], 20);
  const secretHits = await searchInFiles(ctx.root, ctx.files.source, [/STRIPE_WEBHOOK_SECRET/i, /webhookSecret/i], 20);
  const signatureHits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/constructEvent\(/i, /stripe\.webhooks\.constructEvent/i, /signature/i, /validateSignature/i],
    25
  );

  for (const m of [...webhookRouteHits, ...rawBodyHits, ...secretHits, ...signatureHits]) {
    evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
  }

  return [
    {
      key: 'billing.stripe',
      present: hasStripe || webhookRouteHits.length > 0 || signatureHits.length > 0,
      evidence,
      details: {
        stripe: hasStripe,
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
