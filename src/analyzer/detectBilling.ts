import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

export async function detectBilling(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const hasStripe = hasDep(ctx, 'stripe');
  if (hasStripe) evidence.push({ type: 'dependency', value: 'stripe' });

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      /STRIPE_SECRET_KEY/,
      /STRIPE_WEBHOOK_SECRET/,
      /checkout/i,
      /subscription/i,
      /customerId/i,
      /plan/i,
      /tier/i,
      /webhook/i,
      /constructEvent\(/,
      /stripe\.webhooks\.constructEvent/i,
      /express\.raw\(/i,
      /req\.rawBody/i,
      /signature/i,
      /webhookSecret/i,
    ],
    40
  );
  for (const m of hits) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  const hasWebhook = hits.some((m) => /webhook/i.test(m.snippet));
  const hasWebhookSecret = hits.some((m) => /STRIPE_WEBHOOK_SECRET|webhookSecret/i.test(m.snippet));
  const hasSignature = hits.some((m) => /constructEvent\(|signature|rawBody|express\.raw/i.test(m.snippet));

  return {
    key: 'billing.stripe',
    present: hasStripe || hits.length > 0,
    evidence,
    details: {
      stripe: hasStripe,
      hasWebhook,
      hasWebhookSecret,
      webhookSignatureValidation: hasSignature,
    },
  };
}
